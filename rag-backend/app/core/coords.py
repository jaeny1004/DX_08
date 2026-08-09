"""EPSG:5186 -> EPSG:4326 좌표 변환과 최소 Point 타입.

pyproj(24MB) + shapely(+ 딸려오는 numpy 51MB)를 배포 의존성에서 빼기 위해 만들었다.
Vercel 함수 225MB 한도를 넘겨 백엔드 배포가 실패했고, 실제 사용처를 조사해 보니

  - shapely.geometry.Point : .x / .y / .centroid 만 쓰고 기하 연산은 전혀 없었다
  - pyproj.Transformer     : EPSG:5186 -> EPSG:4326 변환 하나에만 썼다

두 가지뿐이라 표준 역 횡메르카토르(Snyder, USGS Professional Paper 1395) 식으로
직접 계산한다. 한국 영역에서 pyproj 대비 오차가 밀리미터 미만인 것을 확인했다
(scripts 없이 임시 스크립트로 격자 대조 — 커밋 메시지에 수치 기록).

EPSG:5186 = Korea 2000 / Central Belt 2010
  타원체 GRS80, lat_0=38, lon_0=127, k_0=1, x_0=200000, y_0=600000
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# --- GRS80 ---
_A = 6378137.0
_F = 1.0 / 298.257222101
_E2 = 2.0 * _F - _F * _F

# --- EPSG:5186 투영 파라미터 ---
_LAT0 = math.radians(38.0)
_LON0 = math.radians(127.0)
_K0 = 1.0
_X0 = 200000.0
_Y0 = 600000.0

_E_P2 = _E2 / (1.0 - _E2)
_E1 = (1.0 - math.sqrt(1.0 - _E2)) / (1.0 + math.sqrt(1.0 - _E2))

# 자오선호장 계수
_C1 = 1.0 - _E2 / 4.0 - 3.0 * _E2**2 / 64.0 - 5.0 * _E2**3 / 256.0
_C2 = 3.0 * _E2 / 8.0 + 3.0 * _E2**2 / 32.0 + 45.0 * _E2**3 / 1024.0
_C3 = 15.0 * _E2**2 / 256.0 + 45.0 * _E2**3 / 1024.0
_C4 = 35.0 * _E2**3 / 3072.0


def _meridional_arc(lat: float) -> float:
    return _A * (
        _C1 * lat
        - _C2 * math.sin(2.0 * lat)
        + _C3 * math.sin(4.0 * lat)
        - _C4 * math.sin(6.0 * lat)
    )


_M0 = _meridional_arc(_LAT0)


def to_wgs84(x: float, y: float) -> tuple[float, float]:
    """EPSG:5186 (x=easting, y=northing) -> (lon, lat) 도 단위.

    pyproj의 ``Transformer.from_crs("EPSG:5186", "EPSG:4326", always_xy=True)``
    와 인자·반환 순서를 맞췄다.
    """
    m = _M0 + (y - _Y0) / _K0
    mu = m / (_A * _C1)

    phi1 = (
        mu
        + (3.0 * _E1 / 2.0 - 27.0 * _E1**3 / 32.0) * math.sin(2.0 * mu)
        + (21.0 * _E1**2 / 16.0 - 55.0 * _E1**4 / 32.0) * math.sin(4.0 * mu)
        + (151.0 * _E1**3 / 96.0) * math.sin(6.0 * mu)
        + (1097.0 * _E1**4 / 512.0) * math.sin(8.0 * mu)
    )

    sin_phi1 = math.sin(phi1)
    cos_phi1 = math.cos(phi1)
    tan_phi1 = math.tan(phi1)

    c1 = _E_P2 * cos_phi1 * cos_phi1
    t1 = tan_phi1 * tan_phi1
    denom = 1.0 - _E2 * sin_phi1 * sin_phi1
    n1 = _A / math.sqrt(denom)
    r1 = _A * (1.0 - _E2) / (denom**1.5)
    d = (x - _X0) / (n1 * _K0)

    lat = phi1 - (n1 * tan_phi1 / r1) * (
        d**2 / 2.0
        - (5.0 + 3.0 * t1 + 10.0 * c1 - 4.0 * c1**2 - 9.0 * _E_P2) * d**4 / 24.0
        + (
            61.0
            + 90.0 * t1
            + 298.0 * c1
            + 45.0 * t1**2
            - 252.0 * _E_P2
            - 3.0 * c1**2
        )
        * d**6
        / 720.0
    )

    lon = _LON0 + (
        d
        - (1.0 + 2.0 * t1 + c1) * d**3 / 6.0
        + (5.0 - 2.0 * c1 + 28.0 * t1 - 3.0 * c1**2 + 8.0 * _E_P2 + 24.0 * t1**2)
        * d**5
        / 120.0
    ) / cos_phi1

    return math.degrees(lon), math.degrees(lat)


class Transformer:
    """pyproj.Transformer 중 이 프로젝트가 쓰던 부분만 흉내 낸 대체 클래스.

    호출부를 그대로 두기 위해 시그니처를 맞췄다.
    EPSG:5186 -> EPSG:4326 외의 조합은 명시적으로 거부한다.
    """

    _SUPPORTED = ("EPSG:5186", "EPSG:4326")

    def __init__(self, crs_from: str, crs_to: str, always_xy: bool) -> None:
        if (crs_from, crs_to) != self._SUPPORTED or not always_xy:
            raise ValueError(
                "app.core.coords.Transformer는 "
                "EPSG:5186 -> EPSG:4326 (always_xy=True) 만 지원한다. "
                f"요청: {crs_from} -> {crs_to}, always_xy={always_xy}"
            )

    @classmethod
    def from_crs(cls, crs_from: str, crs_to: str, always_xy: bool = False) -> "Transformer":
        return cls(crs_from, crs_to, always_xy)

    @staticmethod
    def transform(x: float, y: float) -> tuple[float, float]:
        return to_wgs84(x, y)


@dataclass(frozen=True)
class Point:
    """shapely.geometry.Point 대체.

    이 프로젝트는 Point를 좌표 그릇으로만 썼다(.x / .y / .centroid).
    기하 연산이 필요해지면 그때 shapely를 다시 들여야 한다.
    """

    x: float
    y: float

    @property
    def centroid(self) -> "Point":
        return self
