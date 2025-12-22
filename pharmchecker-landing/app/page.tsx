const sectionTitleClass = "text-2xl font-semibold tracking-tight text-slate-900";
const sectionBodyClass = "mt-3 text-base leading-7 text-slate-700";

function Container({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-6">{children}</div>;
}

function Card({
  title,
  description
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="text-base font-semibold text-slate-900">{title}</div>
      {description ? (
        <div className="mt-2 text-sm leading-6 text-slate-700">
          {description}
        </div>
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <main className="min-h-screen">
      {/* 1. Hero Section */}
      <section className="border-b border-slate-200 bg-white">
        <Container>
          <div className="grid grid-cols-1 gap-10 py-16 lg:grid-cols-12 lg:py-20">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                의료 B2B 소프트웨어
              </div>

              <h1 className="mt-5 animate-fadeUp text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                PharmChecker
                <span className="block text-slate-900">
                  바코드 기반 약품 조제 안전 지원 시스템
                </span>
              </h1>

              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">
                유사한 약품명, 혼동하기 쉬운 용량 표기
                <br />
                실수가 발생하기 쉬운 약국 조제 업무를 위한 신뢰할 수 있는 확인 도우미
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href="#contact"
                  className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  데모 문의
                </a>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  작동 방식
                </a>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <div className="text-sm font-semibold text-slate-900">
                  약국 환경에 맞춘 설계
                </div>
                <div className="mt-3 text-sm leading-6 text-slate-700">
                  빠르고 단순한 바코드 검증으로 조제 실수를 줄입니다.
                </div>
                <div className="mt-6 grid grid-cols-1 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-medium text-slate-600">
                      검증
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      일치 / 불일치 알림
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-medium text-slate-600">
                      워크플로우
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      조제 과정에서 바코드 스캔
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-medium text-slate-600">
                      목적
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      반복 업무에서의 인적 오류 예방
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* 2. Problem Section */}
      <section className="bg-white">
        <Container>
          <div className="py-16">
            <h2 className={sectionTitleClass}>문제</h2>
            <p className={sectionBodyClass}>
              조제 업무는 반복적이고 시간에 민감합니다. 숙련된 팀에서도
              충분히 예방 가능한 실수가 발생할 수 있습니다.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card title="유사한 약품명" />
              <Card title="동일 성분, 다른 함량" />
              <Card title="제조사에 따른 포장 변경" />
              <Card title="반복 조제 업무에서의 인적 오류" />
            </div>
          </div>
        </Container>
      </section>

      {/* 3. Solution Section */}
      <section className="border-y border-slate-200 bg-slate-50">
        <Container>
          <div className="py-16">
            <h2 className={sectionTitleClass}>해결</h2>
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-8">
                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                  <p className="whitespace-pre-line text-base leading-7 text-slate-700">
                    PharmChecker는 약품 포장에 인쇄된 제품 바코드를 사용해
                    {"\n"}실제 조제하려는 약품이
                    {"\n"}처방된 약품과 일치하는지
                    {"\n"}검증하는 조제 지원 프로그램입니다.
                  </p>

                  <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">
                      이 시스템은 검증합니다.
                      <br />
                      의학적 결정을 내리지 않습니다.
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="text-sm font-semibold text-slate-900">
                    조제 지원
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-700">
                    명확한 검증 피드백으로 속도를 해치지 않으면서도
                    일관된 업무 흐름을 돕습니다.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* 4. How It Works Section */}
      <section id="how-it-works" className="bg-white">
        <Container>
          <div className="py-16">
            <h2 className={sectionTitleClass}>작동 방식</h2>

            <ol className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-4">
              <li className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="text-xs font-semibold text-slate-600">
                  1단계
                </div>
                <div className="mt-2 text-base font-semibold text-slate-900">
                  처방 약품 목록 불러오기
                </div>
              </li>
              <li className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="text-xs font-semibold text-slate-600">
                  2단계
                </div>
                <div className="mt-2 text-base font-semibold text-slate-900">
                  제품 바코드 스캔
                </div>
              </li>
              <li className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="text-xs font-semibold text-slate-600">
                  3단계
                </div>
                <div className="mt-2 text-base font-semibold text-slate-900">
                  시스템 자동 비교
                </div>
              </li>
              <li className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="text-xs font-semibold text-slate-600">
                  4단계
                </div>
                <div className="mt-2 text-base font-semibold text-slate-900">
                  일치 / 불일치 즉시 알림
                </div>
              </li>
            </ol>
          </div>
        </Container>
      </section>

      {/* 5. Key Features Section */}
      <section className="border-y border-slate-200 bg-slate-50">
        <Container>
          <div className="py-16">
            <h2 className={sectionTitleClass}>핵심 기능</h2>

            <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card
                title="제품 바코드 기반 검증"
                description="스캔한 포장 바코드를 처방 항목과 비교해 확인합니다."
              />
              <Card
                title="성분 및 함량 일치 확인"
                description="유효성분과 함량까지 함께 확인해 혼동을 줄입니다."
              />
              <Card
                title="즉각적인 시각·음성 알림"
                description="즉시 알림으로 망설임과 경고 누락을 줄입니다."
              />
              <Card
                title="조제 오류 예방 로그"
                description="검증 결과를 기록해 사후 확인과 개선에 활용할 수 있습니다."
              />
            </div>
          </div>
        </Container>
      </section>

      {/* 6. Philosophy / Trust Section */}
      <section className="bg-white">
        <Container>
          <div className="py-16">
            <h2 className={sectionTitleClass}>철학 / 신뢰</h2>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card title="약사를 의심하지 않습니다" />
              <Card title="사람은 실수할 수 있다고 가정합니다" />
              <Card title="검증은 빠르고 단순해야 합니다" />
              <Card title="한 번의 알림이 한 명의 환자를 보호할 수 있습니다" />
            </div>
          </div>
        </Container>
      </section>

      {/* 7. Call To Action Section */}
      <section id="contact" className="border-t border-slate-200 bg-slate-50">
        <Container>
          <div className="py-16">
            <div className="rounded-2xl border border-slate-200 bg-white p-8">
              <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
                <div className="lg:col-span-8">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                    약국에서 PharmChecker 도입을 고려하고 계신가요?
                  </h2>
                </div>
                <div className="lg:col-span-4 lg:flex lg:justify-end">
                  <a
                    href="mailto:contact@example.com"
                    className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 lg:w-auto"
                  >
                    문의하기
                  </a>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* 8. Footer */}
      <footer className="bg-white">
        <Container>
          <div className="flex flex-col gap-3 border-t border-slate-200 py-10 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <div className="whitespace-pre-line">
              PharmChecker ©
              {"\n"}약품 조제 안전 지원 시스템
            </div>
            <div>contact@example.com</div>
          </div>
        </Container>
      </footer>
    </main>
  );
}
