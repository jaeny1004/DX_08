/**
 * Neural CA 확산 시뮬레이션 forward 엔진 (브라우저 실행).
 *
 * 학습은 PyTorch로 했지만(scripts/train_pilot_ca.py), torch는 Vercel 함수
 * 250MB 제한을 넘어 서버에 올릴 수 없다. 그래서 학습된 가중치만 JSON으로
 * 내보내고(scripts/export_ca_web.py) 추론은 여기서 직접 한다.
 *
 * 모델 구조(학습 코드와 동일해야 한다):
 *   x = concat(state[9], ctx[3])              -> 12채널
 *   h = relu(conv3x3(x))                      -> hidden 64
 *   h = relu(conv1x1(h))                      -> 64
 *   d = conv1x1(h)                            -> 9
 *   alive = maxpool3x3(sigmoid(state[0])) > 0.3
 *   state = clamp(state + d * alive * mask, -10, 10)
 *
 * 한 해 = CA 10스텝.
 */

export interface CaWeights {
  n_state: number;
  n_ctx: number;
  hidden: number;
  perceive_w: number[][][][]; // [hidden][12][3][3]
  perceive_b: number[];
  u1_w: number[][]; // [hidden][hidden]
  u1_b: number[];
  u2_w: number[][]; // [n_state][hidden]
  u2_b: number[];
  alive_thr: number;
}

export interface CaGrid {
  H: number;
  W: number;
  mask: number[];
  pine: number[];
  forest: number[];
  elev: number[];
  seed2022: number[];
}

/** 한 해 롤아웃에 쓰는 CA 스텝 수. 학습과 같아야 한다. */
export const CA_STEPS = 10;

interface CompiledWeights {
  nState: number;
  nCtx: number;
  hidden: number;
  /** [hidden][12*9] 로 펼친 3x3 커널 */
  perceive: Float32Array;
  perceiveBias: Float32Array;
  u1: Float32Array;
  u1Bias: Float32Array;
  u2: Float32Array;
  u2Bias: Float32Array;
  aliveThr: number;
}

function compile(weights: CaWeights): CompiledWeights {
  const { hidden, n_state: nState, n_ctx: nCtx } = weights;
  const inChannels = nState + nCtx;

  const perceive = new Float32Array(hidden * inChannels * 9);
  for (let o = 0; o < hidden; o += 1) {
    for (let c = 0; c < inChannels; c += 1) {
      for (let ky = 0; ky < 3; ky += 1) {
        for (let kx = 0; kx < 3; kx += 1) {
          perceive[(o * inChannels + c) * 9 + ky * 3 + kx] =
            weights.perceive_w[o][c][ky][kx];
        }
      }
    }
  }

  const u1 = new Float32Array(hidden * hidden);
  for (let o = 0; o < hidden; o += 1) {
    for (let i = 0; i < hidden; i += 1) u1[o * hidden + i] = weights.u1_w[o][i];
  }

  const u2 = new Float32Array(nState * hidden);
  for (let o = 0; o < nState; o += 1) {
    for (let i = 0; i < hidden; i += 1) u2[o * hidden + i] = weights.u2_w[o][i];
  }

  return {
    nState,
    nCtx,
    hidden,
    perceive,
    perceiveBias: Float32Array.from(weights.perceive_b),
    u1,
    u1Bias: Float32Array.from(weights.u1_b),
    u2,
    u2Bias: Float32Array.from(weights.u2_b),
    aliveThr: weights.alive_thr,
  };
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

export interface RolloutOptions {
  /** 시작 감염 셀(0/1). 길이 H*W. 방제 시나리오는 여기서 감염원을 빼고 넣는다. */
  seed: Float32Array | number[];
  /** 스텝마다 감염 확률을 받는다. 진행 표시·중간 프레임 저장에 쓴다. */
  onStep?: (step: number, probability: Float32Array) => void;
}

/**
 * CA를 CA_STEPS만큼 굴려 각 스텝의 감염 확률을 돌려준다.
 *
 * 갱신은 alive 게이트가 열린 칸에서만 일어나므로(감염 셀의 3x3 이웃),
 * 그 밖의 칸은 계산을 건너뛴다. 전국이 아니라 감염 전선 주변만 도는 셈이라
 * 브라우저에서도 실용적인 속도가 나온다.
 */
export function runRollout(
  weights: CaWeights,
  grid: CaGrid,
  options: RolloutOptions,
): Float32Array[] {
  const compiled = compile(weights);
  const { H, W } = grid;
  const size = H * W;
  const { nState, nCtx, hidden, aliveThr } = compiled;
  const inChannels = nState + nCtx;

  const mask = Float32Array.from(grid.mask);
  const ctx = [
    Float32Array.from(grid.pine),
    Float32Array.from(grid.forest),
    Float32Array.from(grid.elev),
  ];

  // state[channel][cell]
  const state: Float32Array[] = [];
  for (let c = 0; c < nState; c += 1) state.push(new Float32Array(size));
  // 감염 채널만 0/1 seed를 logit(-3/+3)으로 바꿔 넣는다(학습 코드와 동일).
  for (let i = 0; i < size; i += 1) {
    state[0][i] = options.seed[i] > 0 ? 3 : -3;
  }

  const frames: Float32Array[] = [];
  const alive = new Uint8Array(size);
  const patch = new Float32Array(inChannels * 9);
  const hiddenBuf = new Float32Array(hidden);
  const hidden2 = new Float32Array(hidden);
  const delta = new Float32Array(nState);

  for (let step = 0; step < CA_STEPS; step += 1) {
    // alive = 감염확률 3x3 최대값이 임계 초과인 칸
    alive.fill(0);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const index = y * W + x;
        if (mask[index] === 0) continue;
        let maximum = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= H) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            if (nx < 0 || nx >= W) continue;
            const probability = sigmoid(state[0][ny * W + nx]);
            if (probability > maximum) maximum = probability;
          }
        }
        if (maximum > aliveThr) alive[index] = 1;
      }
    }

    // 갱신량은 alive 칸에서만 계산한다.
    const updates: Array<{ index: number; values: Float32Array }> = [];
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const index = y * W + x;
        if (alive[index] === 0) continue;

        // 3x3 패치를 채운다(경계 밖은 0 = zero padding).
        patch.fill(0);
        for (let ky = 0; ky < 3; ky += 1) {
          const ny = y + ky - 1;
          if (ny < 0 || ny >= H) continue;
          for (let kx = 0; kx < 3; kx += 1) {
            const nx = x + kx - 1;
            if (nx < 0 || nx >= W) continue;
            const nIndex = ny * W + nx;
            const slot = ky * 3 + kx;
            for (let c = 0; c < nState; c += 1) {
              patch[c * 9 + slot] = state[c][nIndex];
            }
            for (let c = 0; c < nCtx; c += 1) {
              patch[(nState + c) * 9 + slot] = ctx[c][nIndex];
            }
          }
        }

        // perceive -> relu
        for (let o = 0; o < hidden; o += 1) {
          let sum = compiled.perceiveBias[o];
          const base = o * inChannels * 9;
          for (let k = 0; k < inChannels * 9; k += 1) {
            sum += compiled.perceive[base + k] * patch[k];
          }
          hiddenBuf[o] = sum > 0 ? sum : 0;
        }

        // u1 -> relu
        for (let o = 0; o < hidden; o += 1) {
          let sum = compiled.u1Bias[o];
          const base = o * hidden;
          for (let i = 0; i < hidden; i += 1) {
            sum += compiled.u1[base + i] * hiddenBuf[i];
          }
          hidden2[o] = sum > 0 ? sum : 0;
        }

        // u2
        for (let o = 0; o < nState; o += 1) {
          let sum = compiled.u2Bias[o];
          const base = o * hidden;
          for (let i = 0; i < hidden; i += 1) {
            sum += compiled.u2[base + i] * hidden2[i];
          }
          delta[o] = sum;
        }

        updates.push({ index, values: Float32Array.from(delta) });
      }
    }

    // 동시 갱신(학습과 동일하게 한 스텝의 입력은 이전 상태여야 한다).
    for (const update of updates) {
      const scale = mask[update.index];
      if (scale === 0) continue;
      for (let c = 0; c < nState; c += 1) {
        let next = state[c][update.index] + update.values[c] * scale;
        if (next > 10) next = 10;
        else if (next < -10) next = -10;
        state[c][update.index] = next;
      }
    }

    const probability = new Float32Array(size);
    for (let i = 0; i < size; i += 1) {
      probability[i] = mask[i] > 0 ? sigmoid(state[0][i]) : 0;
    }
    frames.push(probability);
    options.onStep?.(step, probability);
  }

  return frames;
}

/**
 * CA 10스텝을 12개월로 펼친다.
 * 월별 예측 모델이 아니라 연 단위 결과의 진행 단계를 보간한 것이다.
 */
export function toMonthlyFrames(frames: Float32Array[]): Float32Array[] {
  if (!frames.length) return [];
  const months: Float32Array[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const position = (month / 12) * (frames.length - 1);
    const low = Math.floor(position);
    const high = Math.min(frames.length - 1, low + 1);
    const ratio = position - low;

    if (ratio === 0) {
      months.push(frames[low]);
      continue;
    }
    const blended = new Float32Array(frames[low].length);
    for (let i = 0; i < blended.length; i += 1) {
      blended[i] = frames[low][i] * (1 - ratio) + frames[high][i] * ratio;
    }
    months.push(blended);
  }
  return months;
}
