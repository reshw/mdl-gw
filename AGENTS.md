<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 배포

**`vercel` CLI로 직접 배포하지 마라.** 이 저장소는 `git push` 하나로 Vercel이 4개 프로젝트에 일괄 배포하는 구조다. 배포 방법은 커밋하고 푸시하는 것뿐이다.

- `vercel --prod`, `vercel deploy`, `vercel link` 전부 쓰지 않는다.
- CLI로 수동 배포하면 **git에 없는 로컬 작업트리가 프로덕션에 올라간다.** 그러면 다음 push 때 git 기준으로 다시 배포되면서 그 변경이 조용히 되돌아간다.
- `.vercel/project.json`은 과거 수동 배포의 잔재라 엉뚱한 프로젝트를 가리킬 수 있다. 자동 배포는 이 파일을 쓰지 않으므로 무시하고, 고치겠다고 건드리지도 마라.

## `wrangler`도 여기서 실행하지 마라 — 이웃 저장소와 혼동하기 쉽다

이 저장소에도 `wrangler.jsonc`와 `.open-next/`가 남아 있다. **Vercel로 이전하기 전의 레거시
OpenNext 배포 설정이고, 지금은 쓰지 않는다.** 여기서 `wrangler deploy`를 돌리면 Next.js 앱이
`mailer-temp` / `mailer-ourim` 워커로 나간다.

메일 수신 워커는 **`D:/dev/mailer-worker`** 라는 별개 저장소다. 두 저장소 모두
`wrangler deploy --env ourim`이 유효하지만 배포 대상이 완전히 다르다:

| 실행 위치 | 배포되는 것 |
|---|---|
| `mailer` (여기) | 레거시 Next.js 앱 워커 `mailer-ourim` — **원치 않는 것** |
| `mailer-worker` | 메일 수신 워커 `mailer-ourim-email` — 이게 맞다 |

워커를 배포할 일이 있으면 **먼저 `cd D:/dev/mailer-worker`** 하고, 출력의 `Uploaded <이름>` 을
확인할 것. 이름에 `-email`이 없으면 저장소를 잘못 짚은 것이다.

## 테넌트 구조

한 코드베이스가 테넌트별 Vercel 프로젝트로 나뉘어 배포된다(`gw.mdl.kr` / `gw.scnd.kr` / `gw.ourim.kr` 등). 환경변수는 각 Vercel 프로젝트에 설정돼 있고, 로컬 `.env.*` 파일은 개발용 사본이다. 따라서 **한 테넌트를 고치면 나머지 테넌트에도 그대로 나간다** — 변경이 테넌트 공용인지 항상 확인할 것.
