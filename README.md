# HOLO NOW — 홀로라이브 비공식 팬 아카이브

홀로라이브 탤런트의 공개 방송 일정, 공식 콘서트 기록, 무료 YouTube
라이브 아카이브, 음악, 카드 컬렉션과 일본·한국 현지 행사를 한눈에 보는
비공식 정적 페이지입니다.

## 주요 기능

- JP·EN·ID·DEV_IS hololive 채널만 수집하는 방송 일정
- 공식 합동 공연과 정식·유료 솔로 공연을 합친 콘서트 아카이브
- 한국어·영문·일문·별칭을 지원하는 검색
- 모든 현재 탤런트의 얼굴과 카테고리로 찾는 무료 YouTube 라이브
- 일본·한국 공식 현지 행사 필터
- 기수·데뷔 순 멤버 목록과 앨범별 솔로곡, 콜라보, 커버를 모은 음악 아카이브
- 곡 길이 정렬과 YouTube·음원·앨범 감상 링크
- `hololive Dreams` 공식 참여 멤버 54명의 브라우저 저장형 보유 체크리스트
- `hololive Dreams` 이벤트·픽업 일정과 비공식 뽑기 확률 계산기
- 일본판 `hololive OFFICIAL CARD GAME`의 부스터·덱·프로모 전체 카드 체크리스트
- 반다이 홀로라이브 웨하스의 출시·카드 종류별 보유 체크리스트
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
  - 공식 hololive 로스터의 프로필, 얼굴 이미지, 검색용 별칭을 담습니다.
  - 과거 솔로 공연 연결을 위해 일부 졸업 멤버는 `alumni`로 별도 표시합니다.
- `public/data/solo-lives.json`
  - 공식 이벤트·뉴스와 공식 주최·레이블 페이지에서 확인한 주요
    단독·원맨 공연 기록입니다.
  - 화면에서는 `events.json`의 콘서트와 합치며, 공식 URL과 날짜·제목이
    같은 공연은 한 번만 표시합니다.
- `public/data/youtube-lives.json`
  - 공식 공개 YouTube 채널에서 무료로 볼 수 있는 생일·주년·3D·무료
    콘서트 아카이브입니다.
  - 영상 ID, 멤버 ID, 카테고리, 공개일, 길이, 썸네일과 YouTube 링크를
    담으며 길이를 확인할 수 없는 영상도 지원합니다.
- `public/data/music.json`
  - 현재 활동·제휴 멤버를 기수와 공식 데뷔일 순으로 정렬할 수 있는 정보와
    솔로곡·콜라보·커버의 제목, 앨범, 공개일, 곡 길이, 감상 링크를 담습니다.
  - 공개 원곡·커버 목록을 공식 프로필 및 음악 링크와 대조하며, 원곡 길이는
    공개 YouTube 재생 메타데이터에서 확인합니다. 확인할 수 없는 길이는 비워 둡니다.
- `public/data/hololive-dreams.json`
  - `hololive Dreams` 공식 사이트의 출시 참여 멤버 54명과 공식 캐릭터
    썸네일을 담습니다.
  - 공식 X에서 확인한 게임 이벤트의 챕터별 멤버·곡·시작 시각과 픽업
    일정을 함께 담습니다. 외부 공식 공지에 없는 종료 시각은 비워 둡니다.
  - 게임 내 `제공 비율`을 확인한 날짜와 근거 링크, 등급별 확률과
    배너·대상별 고정 계산 프리셋을 함께 담습니다.
  - 공개 공식 웹에는 확률표 원문이 게시되어 있지 않으므로 게임 내 제공
    비율을 확인한 공개 자료와 공식 게임 공지를 구분해 표시합니다.
  - 보유 체크 정보는 로그인이나 서버 없이 현재 브라우저의 로컬 저장소에만
    저장됩니다.
- `public/data/hololive-official-card-game.json`
  - 일본판 hOCG 공식 카드리스트의 공개 레코드, 레어도, 수록 제품과 공식
    카드 이미지를 담습니다.
  - 같은 카드가 여러 제품에 재수록되면 하나의 보유 상태를 공유하며, 공식
    사이트에 선공개된 출시 예정 제품은 화면에서 별도로 표시합니다.
- `public/data/hololive-wafers.json`
  - 반다이 캔디 공식 제품 페이지에서 확인한 발매·출시 예정 홀로라이브
    웨하스의 멤버·그룹 카드와 공식 라인업 이미지를 담습니다.
  - 카드게임용 트윈 웨하스는 hOCG 탭으로 분리하며, 전체 카드 이미지와 정확한
    발매일이 공개되지 않은 시리즈는 향후 갱신 대상으로 남깁니다.

YouTube 아카이브 수집·정리 스크립트는 별도 API 키나 유료 서비스 없이
실행됩니다.

```powershell
npm run collect:youtube-archive
npm run enrich:youtube-archive
npm run update:youtube-archive
npm run update:hololive-dreams
npm run update:card-game
npm run update:wafers
npm run update:music
```

카드 데이터는 고빈도 방송 일정 수집과 분리해 관리합니다. `update:card-game`은
실행 시 공식 카드 DB를 다시 수집하고, `update:wafers`는 스크립트에 검증해 둔
반다이 공식 제품 정의로 스냅샷을 재생성합니다. 신규 웨하스가 발매되면 공식
제품 페이지와 라인업 시트 정의를 추가한 뒤 두 데이터 파일을 검증·배포해야 합니다.

## 새 GitHub Pages로 배포

1. 이 프로젝트를 GitHub **공개 저장소**에 올리고 기본 브랜치를 `main`으로 둡니다.
2. 저장소의 `Settings → Pages → Build and deployment`에서 Source를
   **GitHub Actions**로 선택합니다.
3. `Actions` 탭에서 `Update and deploy Hololive schedule`을 한 번
   수동 실행합니다.

`.github/workflows/deploy-pages.yml`이 다음 작업을 수행합니다.

```text
매시 07분·22분·37분·52분
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
