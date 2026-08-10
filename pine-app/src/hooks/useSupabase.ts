import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { createClient } from '@supabase/supabase-js';
import { PineRecord } from '../types';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://mock-url.supabase.co';

const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'mock-key';

const hasRealKeys = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
  (
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  )
);

export const supabase = hasRealKeys
  ? createClient(supabaseUrl, supabaseKey)
  : null;

function mapSupabaseToPineRecord(
  row: any
): PineRecord {
  return {
    id: row.id,
    created_at: row.created_at,
    latitude: row.latitude,
    longitude: row.longitude,
    image_url: row.image_url,
    phone_number: row.phone_number,
    status: row.status,

    report_token: row.report_token ?? null,

    ai_probability:
      row.ai_probability ?? null,
    ai_label:
      row.ai_label ?? null,
    ai_status:
      row.ai_status ?? null,
  };
}

function mapPineRecordToSupabase(
  record: Omit<
    PineRecord,
    'id' | 'created_at'
  >
) {
  return {
    latitude: record.latitude,
    longitude: record.longitude,
    image_url: record.image_url,
    phone_number: record.phone_number,
    status: record.status,

    report_token:
      record.report_token ?? null,

    ai_probability:
      record.ai_probability ?? null,
    ai_label:
      record.ai_label ?? null,
    ai_status:
      record.ai_status ?? null,
  };
}

/*
 * Supabase Storage의 public URL에서
 * pine-images 내부 파일 경로만 추출합니다.
 */
function getStorageObjectPath(
  imageUrl: string
): string | null {
  const marker =
    '/storage/v1/object/public/pine-images/';

  const markerIndex =
    imageUrl.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const pathWithQuery = imageUrl.slice(
    markerIndex + marker.length
  );

  const path =
    pathWithQuery.split('?')[0];

  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

let mockRecords: PineRecord[] = [
  {
    id: 'mock-1',
    created_at: new Date(
      Date.now() - 1000 * 60 * 60
    ).toISOString(),
    latitude: 37.5665,
    longitude: 126.978,
    image_url:
      'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?auto=format&fit=crop&q=80&w=400',
    phone_number: '010-1234-5678',
    status: 'pending',
    ai_probability: null,
    ai_label: null,
    ai_status: 'pending',
  },
  {
    id: 'mock-2',
    created_at: new Date(
      Date.now() - 1000 * 60 * 60 * 24
    ).toISOString(),
    latitude: 37.57,
    longitude: 126.98,
    image_url:
      'https://images.unsplash.com/photo-1611082531980-0a75d50ba95a?auto=format&fit=crop&q=80&w=400',
    phone_number: '010-9876-5432',
    status: 'completed',
    ai_probability: 87,
    ai_label:
      'pine_disease_suspected',
    ai_status: 'completed',
  },
];

export type FieldPhotoWorkMode =
  | 'surveillance'
  | 'control';

export interface SaveFieldPhotoParams {
  file: File;

  workMode: FieldPhotoWorkMode;

  relatedRecordId: string;

  latitude: number;
  longitude: number;
}

export interface SaveFieldVoiceLogParams {
  file: File;

  workMode: FieldPhotoWorkMode;

  relatedRecordId: string;

  durationSeconds: number;

  latitude: number;
  longitude: number;
}

export interface SaveFieldVoiceLogResult {
  success: boolean;

  transcript?: string;

  voiceLogId?: string;

  storagePath?: string;

  error?: string;
}

interface FieldAudioSttResponse {
  success?: boolean;

  transcript?: string;

  error?: string;
}

/*
 * 음성 STT 요청 주소. Chatbot.tsx 와 같은 규칙이다.
 *
 * VITE_RAG_API_BASE 가 있으면 그 백엔드를 직접 부르고(로컬 개발),
 * 없으면 같은 도메인의 서버리스 함수 api/field-audio-stt.ts 를 부른다(배포).
 */
const RAG_API_BASE = (
  (import.meta.env.VITE_RAG_API_BASE as
    | string
    | undefined) || ''
).replace(/\/+$/, '');

const STT_ENDPOINT = `${RAG_API_BASE}/api/field-audio-stt`;



interface SupabaseContextType {
  records: PineRecord[];
  loading: boolean;

  fetchRecords:
  () => Promise<void>;

  addRecord: (
    record: Omit<
      PineRecord,
      'id' | 'created_at'
    >
  ) => Promise<PineRecord | null>;

  updateStatus: (
    id: string,
    status: PineRecord['status']
  ) => Promise<boolean>;

  deleteRecord: (
    id: string
  ) => Promise<boolean>;

  uploadImage: (
    file: File
  ) => Promise<string | null>;

  saveFieldPhoto: (
    params: SaveFieldPhotoParams
  ) => Promise<boolean>;

  saveFieldVoiceLog: (
  params: SaveFieldVoiceLogParams
) => Promise<SaveFieldVoiceLogResult>;
}

const SupabaseContext =
  createContext<
    SupabaseContextType | undefined
  >(undefined);

export function SupabaseProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [records, setRecords] =
    useState<PineRecord[]>([]);

  const [loading, setLoading] =
    useState(true);

  const fetchRecords = async () => {
    setLoading(true);

    if (supabase) {
      const { data, error } =
        await supabase
          .from('pine_records')
          .select('*')
          .order('created_at', {
            ascending: false,
          });

      if (error) {
        console.error(
          '민원 목록 조회 실패:',
          error
        );
      } else if (data) {
        setRecords(
          data.map(
            mapSupabaseToPineRecord
          )
        );
      }
    } else {
      setRecords([...mockRecords]);
    }

    setLoading(false);
  };

  /*
   * 앱이 처음 실행될 때 목록 조회
   */
  useEffect(() => {
    void fetchRecords();
  }, []);

  /*
   * Supabase pine_records 실시간 구독
   *
   * 다른 화면이나 다른 기기에서
   * 신고 추가·상태 변경·삭제가 발생하면
   * records 상태를 즉시 변경합니다.
   */
  useEffect(() => {
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel('pine-records-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pine_records',
        },
        payload => {
          if (
            payload.eventType === 'INSERT'
          ) {
            const newRecord =
              mapSupabaseToPineRecord(
                payload.new
              );

            setRecords(previous => {
              const alreadyExists =
                previous.some(
                  record =>
                    record.id ===
                    newRecord.id
                );

              if (alreadyExists) {
                return previous;
              }

              return [
                newRecord,
                ...previous,
              ];
            });

            return;
          }

          if (
            payload.eventType === 'UPDATE'
          ) {
            const updatedRecord =
              mapSupabaseToPineRecord(
                payload.new
              );

            setRecords(previous =>
              previous.map(record =>
                record.id ===
                  updatedRecord.id
                  ? updatedRecord
                  : record
              )
            );

            return;
          }

          if (
            payload.eventType === 'DELETE'
          ) {
            const deletedId =
              (
                payload.old as {
                  id?: string;
                }
              ).id;

            if (!deletedId) {
              return;
            }

            setRecords(previous =>
              previous.filter(
                record =>
                  record.id !== deletedId
              )
            );
          }
        }
      )
      .subscribe(status => {
        console.log(
          'pine_records Realtime:',
          status
        );
      });

    return () => {
      void supabase.removeChannel(
        channel
      );
    };
  }, []);

  const addRecord = async (
    record: Omit<
      PineRecord,
      'id' | 'created_at'
    >
  ): Promise<PineRecord | null> => {
    if (supabase) {
      const insertData =
        mapPineRecordToSupabase(record);

      const { data, error } =
        await supabase
          .from('pine_records')
          .insert([insertData])
          .select()
          .single();

      if (error) {
        console.error(
          '민원 등록 실패:',
          error
        );

        return null;
      }

      const newRecord =
        mapSupabaseToPineRecord(data);

      /*
       * Realtime 수신 전에도
       * 현재 화면에서 즉시 반영
       */
      setRecords(previous => {
        const alreadyExists =
          previous.some(
            item =>
              item.id === newRecord.id
          );

        if (alreadyExists) {
          return previous;
        }

        return [
          newRecord,
          ...previous,
        ];
      });

      return newRecord;
    }

    const newRecord: PineRecord = {
      ...record,
      id: `mock-${Date.now()}`,
      created_at:
        new Date().toISOString(),
    };

    mockRecords = [
      newRecord,
      ...mockRecords,
    ];

    setRecords([...mockRecords]);

    return newRecord;
  };

  const updateStatus = async (
    id: string,
    status: PineRecord['status']
  ): Promise<boolean> => {
    const previousRecord =
      records.find(
        record => record.id === id
      );

    /*
     * DB 응답을 기다리지 않고
     * 화면부터 즉시 갱신
     */
    setRecords(previous =>
      previous.map(record =>
        record.id === id
          ? {
            ...record,
            status,
          }
          : record
      )
    );

    if (supabase) {
      const { error } =
        await supabase
          .from('pine_records')
          .update({ status })
          .eq('id', id);

      if (error) {
        console.error(
          '민원 상태 변경 실패:',
          error
        );

        /*
         * DB 변경 실패 시
         * 이전 상태로 복구
         */
        if (previousRecord) {
          setRecords(previous =>
            previous.map(record =>
              record.id === id
                ? previousRecord
                : record
            )
          );
        }

        return false;
      }

      return true;
    }

    mockRecords =
      mockRecords.map(record =>
        record.id === id
          ? {
            ...record,
            status,
          }
          : record
      );

    setRecords([...mockRecords]);

    return true;
  };

  const deleteRecord = async (
    id: string
  ): Promise<boolean> => {
    const targetRecord =
      records.find(
        record => record.id === id
      );

    if (!targetRecord) {
      return false;
    }

    /*
     * 화면에서 먼저 제거
     */
    setRecords(previous =>
      previous.filter(
        record => record.id !== id
      )
    );

    if (supabase) {
      const { error } =
        await supabase
          .from('pine_records')
          .delete()
          .eq('id', id);

      if (error) {
        console.error(
          '민원 삭제 실패:',
          error
        );

        /*
         * 삭제 실패 시 목록 복구
         */
        setRecords(previous => {
          const alreadyExists =
            previous.some(
              record =>
                record.id === id
            );

          if (alreadyExists) {
            return previous;
          }

          return [
            targetRecord,
            ...previous,
          ];
        });

        return false;
      }

      /*
       * DB 삭제가 성공한 경우
       * 연결된 Storage 사진도 정리 시도
       */
      if (targetRecord.image_url) {
        const objectPath =
          getStorageObjectPath(
            targetRecord.image_url
          );

        if (objectPath) {
          const {
            error: storageError,
          } = await supabase.storage
            .from('pine-images')
            .remove([objectPath]);

          if (storageError) {
            console.warn(
              '민원은 삭제됐지만 사진 삭제는 실패했습니다:',
              storageError
            );
          }
        }
      }

      return true;
    }

    mockRecords =
      mockRecords.filter(
        record => record.id !== id
      );

    setRecords([...mockRecords]);

    return true;
  };

  const uploadImage = async (
    file: File
  ): Promise<string | null> => {
    if (supabase) {
      /*
       * Storage 객체 키에 원본 파일명을 그대로 붙이면 안 된다.
       * Supabase 는 키에 ASCII 외 문자를 허용하지 않아서, 한글 파일명이면
       * "Invalid key: 1786339489010-소나무.jpg" 로 400 이 난다.
       * 실제로 시민 신고 사진 업로드가 이 이유로 전부 실패하고 있었다.
       *
       * 파일명은 보존할 이유가 없다(원본 이름을 쓰는 화면이 없다).
       * 확장자만 살리고 나머지는 UUID 로 만든다.
       * 현장사진·음성 업로드는 원래 이 방식이라 문제가 없었다.
       */
      const extension =
        file.name
          .split('.')
          .pop()
          ?.toLowerCase()
          .replace(/[^a-z0-9]/g, '') ||
        'jpg';

      const fileName =
        `${Date.now()}-${crypto.randomUUID()}.${extension}`;

      const { data, error } =
        await supabase.storage
          .from('pine-images')
          .upload(fileName, file, {
            contentType:
              file.type || 'image/jpeg',
            upsert: false,
          });

      if (error || !data) {
        console.error(
          '사진 업로드 실패:',
          error
        );

        return null;
      }

      const { data: publicData } =
        supabase.storage
          .from('pine-images')
          .getPublicUrl(fileName);

      return publicData.publicUrl;
    }

    return URL.createObjectURL(file);
  };

  const saveFieldPhoto = async ({
    file,
    workMode,
    relatedRecordId,
    latitude,
    longitude,
  }: SaveFieldPhotoParams): Promise<boolean> => {
    if (!supabase) {
      console.error(
        'Supabase가 연결되어 있지 않아 현장사진을 저장할 수 없습니다.'
      );

      return false;
    }

    /*
     * 원본 파일 확장자를 확인합니다.
     * 확장자를 알 수 없는 경우 jpg를 사용합니다.
     */
    const originalExtension = file.name
      .split('.')
      .pop()
      ?.toLowerCase();

    const extension =
      originalExtension &&
        [
          'jpg',
          'jpeg',
          'png',
          'webp',
        ].includes(originalExtension)
        ? originalExtension
        : 'jpg';

    const uploadDate = new Date()
      .toISOString()
      .slice(0, 10);

    /*
     * 예찰·조사 사진과 방제·시공 사진을
     * Storage 폴더별로 분리합니다.
     *
     * 예:
     * surveillance/2026-07-29/UUID.jpg
     * control/2026-07-29/UUID.jpg
     */
    const storagePath =
      `${workMode}/${uploadDate}/` +
      `${crypto.randomUUID()}.${extension}`;

    const {
      error: uploadError,
    } = await supabase.storage
      .from('field-photos')
      .upload(
        storagePath,
        file,
        {
          contentType:
            file.type || 'image/jpeg',

          cacheControl: '3600',
          upsert: false,
        }
      );

    if (uploadError) {
      console.error(
        '현장사진 Storage 업로드 실패:',
        uploadError
      );

      return false;
    }

    const {
      error: insertError,
    } = await supabase
      .from('field_photos')
      .insert({
        related_record_id:
          relatedRecordId,

        work_mode:
          workMode,

        storage_path:
          storagePath,

        latitude,
        longitude,

        captured_at:
          new Date().toISOString(),
      });

    if (insertError) {
      console.error(
        '현장사진 DB 등록 실패:',
        {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
        }
      );

      window.alert(
        `DB 등록 실패\n` +
        `코드: ${insertError.code}\n` +
        `내용: ${insertError.message}\n` +
        `상세: ${insertError.details ?? '없음'}`
      );

      const { error: removeError } =
        await supabase.storage
          .from('field-photos')
          .remove([storagePath]);

      if (removeError) {
        console.warn(
          'DB 저장 실패 후 사진 정리 실패:',
          removeError
        );
      }

      return false;
    }

    return true;
  };

  const saveFieldVoiceLog = async ({
  file,
  workMode,
  relatedRecordId,
  durationSeconds,
  latitude,
  longitude,
}: SaveFieldVoiceLogParams): Promise<SaveFieldVoiceLogResult> => {
  if (!supabase) {
    const errorMessage =
      'Supabase가 연결되어 있지 않아 음성 작업일지를 저장할 수 없습니다.';

    console.error(errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }

  /*
   * MediaRecorder가 생성한 파일 확장자를 확인합니다.
   * 대부분 webm 형식으로 생성됩니다.
   */
  const originalExtension =
    file.name
      .split('.')
      .pop()
      ?.toLowerCase();

  const supportedExtensions = [
    'webm',
    'mp4',
    'm4a',
    'ogg',
    'wav',
    'mp3',
    'mpeg',
    'mpga',
    'flac',
  ];

  const extension =
    originalExtension &&
    supportedExtensions.includes(
      originalExtension
    )
      ? originalExtension
      : 'webm';

  const uploadDate =
    new Date()
      .toISOString()
      .slice(0, 10);

  /*
   * 예:
   * control/2026-07-30/UUID.webm
   */
  const storagePath =
    `${workMode}/${uploadDate}/` +
    `${crypto.randomUUID()}.${extension}`;

  /*
   * 1. 녹음 원본을 Storage에 업로드
   */
  const {
    error: uploadError,
  } = await supabase.storage
    .from('field-audio')
    .upload(
      storagePath,
      file,
      {
        contentType:
          file.type ||
          'audio/webm',

        cacheControl:
          '3600',

        upsert:
          false,
      }
    );

  if (uploadError) {
    console.error(
      '현장 음성 Storage 업로드 실패:',
      uploadError
    );

    return {
      success: false,

      error:
        `음성 파일 업로드 실패: ` +
        uploadError.message,
    };
  }

  /*
   * 2. STT 처리 전 DB 행 생성
   */
  const {
    data: insertedLog,
    error: insertError,
  } = await supabase
    .from('field_voice_logs')
    .insert({
      related_record_id:
        relatedRecordId,

      work_mode:
        workMode,

      storage_bucket:
        'field-audio',

      storage_path:
        storagePath,

      mime_type:
        file.type ||
        'audio/webm',

      duration_seconds:
        Number.isFinite(
          durationSeconds
        )
          ? Math.max(
              0,
              durationSeconds
            )
          : null,

      transcript:
        null,

      stt_status:
        'processing',

      stt_error:
        null,

      latitude,
      longitude,

      captured_at:
        new Date()
          .toISOString(),
    })
    .select('id')
    .single();

  if (
    insertError ||
    !insertedLog
  ) {
    console.error(
      '현장 음성 DB 사전 등록 실패:',
      insertError
    );

    /*
     * DB 등록에 실패하면
     * 먼저 올린 Storage 파일을 정리합니다.
     */
    const {
      error: removeError,
    } = await supabase.storage
      .from('field-audio')
      .remove([
        storagePath,
      ]);

    if (removeError) {
      console.warn(
        'DB 등록 실패 후 음성 파일 정리 실패:',
        removeError
      );
    }

    return {
      success: false,

      error:
        `음성 기록 DB 등록 실패: ` +
        (
          insertError
            ?.message ||
          '알 수 없는 오류'
        ),
    };
  }

  const voiceLogId =
    String(insertedLog.id);

  try {
    /*
     * 3. STT Edge Function 호출
     */
    /*
     * 예전에는 Supabase Edge Function 'field-audio-stt' 를 불렀다.
     * 그 함수는 특정 프로젝트에만 배포돼 있어서, Supabase 프로젝트를 옮기면
     * 음성 변환만 조용히 망가졌다. 챗봇과 같은 이유로 웹 백엔드로 합쳤다.
     * OPENAI_API_KEY 도 백엔드 한 곳에서만 관리하면 된다.
     */
    const sttResponse = await fetch(
      STT_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          bucket: 'field-audio',
          path: storagePath,
        }),
      }
    );

    const sttData =
      (await sttResponse.json()) as FieldAudioSttResponse;

    if (!sttResponse.ok) {
      throw new Error(
        sttData?.error ||
        `STT 호출 실패: HTTP ${sttResponse.status}`
      );
    }

    if (
      !sttData?.success
    ) {
      throw new Error(
        sttData?.error ||
        '음성 변환에 실패했습니다.'
      );
    }

    const transcript =
      typeof sttData.transcript ===
        'string'
        ? sttData.transcript.trim()
        : '';

    if (!transcript) {
      throw new Error(
        '변환된 작업일지 내용이 비어 있습니다.'
      );
    }

    /*
     * 4. STT 성공 결과를 DB에 저장
     */
    const {
      error: updateError,
    } = await supabase
      .from('field_voice_logs')
      .update({
        transcript,

        stt_status:
          'completed',

        stt_error:
          null,
      })
      .eq(
        'id',
        insertedLog.id
      );

    if (updateError) {
      throw new Error(
        `STT 결과 DB 저장 실패: ` +
        updateError.message
      );
    }

    return {
      success: true,

      transcript,

      voiceLogId,

      storagePath,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : '음성 변환 중 알 수 없는 오류가 발생했습니다.';

    console.error(
      '현장 음성 STT 처리 실패:',
      error
    );

    /*
     * 음성 파일은 남겨두고
     * DB에 실패 원인을 기록합니다.
     *
     * 나중에 재처리할 수 있으므로
     * Storage 파일은 삭제하지 않습니다.
     */
    const {
      error: errorUpdateError,
    } = await supabase
      .from('field_voice_logs')
      .update({
        stt_status:
          'error',

        stt_error:
          errorMessage,
      })
      .eq(
        'id',
        insertedLog.id
      );

    if (errorUpdateError) {
      console.warn(
        'STT 실패 상태 DB 반영 실패:',
        errorUpdateError
      );
    }

    return {
      success: false,

      voiceLogId,

      storagePath,

      error:
        errorMessage,
    };
  }
};

  return React.createElement(
    SupabaseContext.Provider,
    {
      value: {
        records,
        loading,
        fetchRecords,
        addRecord,
        updateStatus,
        deleteRecord,
        uploadImage,
        saveFieldPhoto,
        saveFieldVoiceLog,
      },
    },
    children
  );
}

export function useSupabase() {
  const context =
    useContext(SupabaseContext);

  if (!context) {
    throw new Error(
      'useSupabase must be used within a SupabaseProvider'
    );
  }

  return context;
}