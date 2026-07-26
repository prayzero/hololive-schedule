# HOLO NOW — GitHub Pages 일정 사이트

홀로라이브 여성 탤런트의 공개 방송 일정, 콘서트, 지난 솔로 라이브,
일본·한국 현지 행사를 한눈에 보는 비공식 정적 페이지입니다.

## 주요 기능

- JP·EN·ID·DEV_IS 여성 브랜치만 수집하는 방송 일정
- 예정 공연과 지난 솔로 라이브를 나눈 전용 탭
- 한국어·영문·일문·별칭을 지원하는 검색
- 멤버 얼굴을 눌러 보는 개인 솔로 공연 기록
- 일본·한국 공식 현지 행사 필터
- 모바일과 데스크톱에 맞춘 반응형 카드 UI

## 비용

- 공개 GitHub 저장소의 GitHub Pages와 표준 GitHub-hosted Actions만 사용합니다.
- 별도 서버, 데이터베이스, 유료 API, 브라우저 API 키가 없습니다.
- 광고, 로그인, 분석 스크립트도 넣지 않았습니다.

GitHub의 무료 정책이나 제한은 바뀔 수 있으므로 배포 전 공식 GitHub 문서를
확인하세요.

## 로컬 실행

프로젝트 폴더에서 실행합니다.

```powershell
npm install
npm run update:schedule
npm run dev
```

브라우저에서 `http://localhost:4174`를 엽니다.

프로덕션 빌드:

```powershell
npm run build
```

산출물은 `dist` 폴더에 만들어집니다.

## 데이터 구성

- `public/data/schedule.json`
  - 공식 Holodule의 [JP](https://schedule.hololive.tv/lives/hololive),
    [ID](https://schedule.hololive.tv/lives/indonesia),
    [EN](https://schedule.hololive.tv/lives/english),
    [DEV_IS](https://schedule.hololive.tv/lives/dev_is) 공개 HTML에서
    날짜, 시각, 채널, YouTube 링크, 썸네일, LIVE 표시를 수집합니다.
  - 남성 그룹 HOLOSTARS 경로와 전체 혼합 경로는 사용하지 않습니다.
  - 원본 카드에 전체 영상 제목이 없으면 화면에는 `채널명 방송`으로 표시합니다.
  - 스크립트가 실패하거나 0건을 읽으면 기존 JSON을 덮어쓰지 않습니다.
- `public/data/events.json`
  - hololive/COVER 또는 공식 협업사 공지에서 확인한 공연·현지 행사의
    한국어 요약입니다.
  - 새 공식 발표가 나오면 이 파일을 검토해 추가합니다.
- `public/data/talents.json`
  - 공식 여성 로스터의 프로필, 얼굴 이미지, 검색용 별칭을 담습니다.
  - 과거 솔로 공연 연결을 위해 일부 졸업 멤버는 `alumni`로 별도 표시합니다.
- `public/data/solo-lives.json`
  - 공식 이벤트·뉴스와 공식 주최·레이블 페이지에서 확인한 주요
    단독·원맨 공연 기록입니다.

## 새 GitHub Pages로 배포

1. 이 프로젝트를 GitHub **공개 저장소**에 올리고 기본 브랜치를 `main`으로 둡니다.
3. 저장소의 `Settings → Pages → Build and deployment`에서 Source를
   **GitHub Actions**로 선택합니다.
4. `Actions` 탭에서 `Update and deploy Hololive schedule`을 한 번
   수동 실행합니다.

`.github/workflows/deploy-pages.yml`이 다음 작업을 수행합니다.

```text
매시 07분·37분
  → 공식 Holodule 일정 수집
  → React 정적 페이지 빌드
  → GitHub Pages artifact 배포
```

Vite의 `base`를 `./`로 설정했기 때문에 저장소 이름을 코드에 넣지 않아도
프로젝트 Pages 하위 경로에서 동작합니다.

## 확인할 점

- 이 페이지는 공식 서비스가 아니며 일정은 예고 없이 변경될 수 있습니다.
- 공연 예매나 현장 방문 전 각 카드의 `공식 공지`를 다시 확인하세요.
- Holodule의 HTML 구조가 바뀌면 자동 수집 작업이 실패할 수 있습니다.
  이 경우 마지막 정상 배포는 유지되며 Actions 로그에서 원인을 확인할 수 있습니다.
- 예약 Actions는 GitHub 사정에 따라 정확히 30분 간격으로 실행되지 않을 수 있습니다.
