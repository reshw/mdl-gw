<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 배포

**`vercel` CLI로 직접 배포하지 마라.** 이 저장소는 `git push` 하나로 Vercel이 4개 프로젝트에 일괄 배포하는 구조다. 배포 방법은 커밋하고 푸시하는 것뿐이다.

- `vercel --prod`, `vercel deploy`, `vercel link` 전부 쓰지 않는다.
- CLI로 수동 배포하면 **git에 없는 로컬 작업트리가 프로덕션에 올라간다.** 그러면 다음 push 때 git 기준으로 다시 배포되면서 그 변경이 조용히 되돌아간다.
- `.vercel/project.json`은 과거 수동 배포의 잔재라 엉뚱한 프로젝트를 가리킬 수 있다. 자동 배포는 이 파일을 쓰지 않으므로 무시하고, 고치겠다고 건드리지도 마라.

한 코드베이스가 테넌트별 Vercel 프로젝트로 나뉘어 배포된다(`gw.mdl.kr` / `gw.scnd.kr` / `gw.ourim.kr` 등). 환경변수는 각 Vercel 프로젝트에 설정돼 있고, 로컬 `.env.*` 파일은 개발용 사본이다. 따라서 **한 테넌트를 고치면 나머지 테넌트에도 그대로 나간다** — 변경이 테넌트 공용인지 항상 확인할 것.
