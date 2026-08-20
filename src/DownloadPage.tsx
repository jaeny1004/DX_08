import React from 'react';

export default function DownloadPage() {
  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '8px' }}>소나무재선충병 현장관리 앱</h2>
      <p style={{ textAlign: 'center', color: '#666', fontSize: '14px', marginBottom: '24px' }}>
        안드로이드 전용 앱 다운로드 및 설치 안내
      </p>

      {/* 1. APK 다운로드 버튼 */}
      <a
        href="/app-release.apk"
        download="소나무재선충병_현장관리.apk"
        style={{
          display: 'block',
          width: '100%',
          padding: '16px 0',
          backgroundColor: '#16a34a',
          color: '#fff',
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '18px',
          borderRadius: '12px',
          textDecoration: 'none',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          marginBottom: '30px'
        }}
      >
        📥 Android 앱 다운로드 (.apk)
      </a>

      {/* 2. 동영상/안내 설명 구역 */}
      <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
        <h3 style={{ fontSize: '16px', marginTop: 0 }}>🎥 설치 가이드 영상</h3>
        
        {/* 가이드 비디오가 있다면 public/guide.mp4 로 넣고 아래 주석 해제 */}
        {/* 
        <video controls style={{ width: '100%', borderRadius: '8px', marginBottom: '16px' }}>
          <source src="/guide.mp4" type="video/mp4" />
          브라우저가 동영상을 지원하지 않습니다.
        </video> 
        */}

        <h4 style={{ fontSize: '14px', color: '#dc2626', marginBottom: '8px' }}>⚠️ 설치 시 경고창 해결 방법</h4>
        <ol style={{ fontSize: '13px', color: '#374151', paddingLeft: '20px', lineHeight: '1.6' }}>
          <li>다운로드 시 <b>"해로운 파일일 수 있음"</b> 안내가 떠도 <b>[무시하고 다운로드]</b>를 누릅니다.</li>
          <li>다운로드된 파일을 열 때 <b>"출처를 알 수 없는 앱"</b> 팝업이 뜨면 <b>[설정]</b>으로 이동해 해당 브라우저의 허용 스위치를 켭니다.</li>
          <li><b>Google Play Protect</b> 경고가 뜨면 <b>[자세히 보기] > [무시하고 설치]</b>를 눌러줍니다.</li>
        </ol>
      </div>
    </div>
  );
}