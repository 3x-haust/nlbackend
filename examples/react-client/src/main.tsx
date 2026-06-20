import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bug, Cloud, Cpu, Database, Gauge, Play, Server, UserCog, Zap } from "lucide-react";
import "./styles.css";

type ReqResponse =
  | {
      ok: true;
      data: unknown;
      trace?: {
        matchedAction: string;
        args: Record<string, unknown>;
        parser?: string;
        model?: string;
        hardware?: string;
        numGpu?: number;
      };
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        candidates?: string[];
        issues?: unknown;
      };
      trace?: {
        matchedAction: string;
        args: Record<string, unknown>;
        parser?: string;
        model?: string;
        hardware?: string;
        numGpu?: number;
      };
    };

const parserOptions = [
  { icon: Cpu, label: "Local", value: "ollama" },
  { icon: Cloud, label: "API", value: "openai-compatible" }
] as const;

type ParserOption = (typeof parserOptions)[number]["value"];

const hardwareOptions = [
  { icon: Cpu, label: "CPU", value: "cpu" },
  { icon: Zap, label: "GPU", value: "gpu" },
  { icon: Gauge, label: "Auto", value: "auto" }
] as const;

type HardwareOption = (typeof hardwareOptions)[number]["value"];

// Optional stronger model used only for write (update/delete) actions, where
// argument precision matters. Empty value = use the same model as reads.
const writeModelOptions = [
  { icon: Cpu, label: "Write: same", value: "" },
  { icon: Zap, label: "Write 7B", value: "qwen2.5:7b" }
] as const;

type WriteModelOption = (typeof writeModelOptions)[number]["value"];

function App() {
  const [text, setText] = useState("");
  const [debug, setDebug] = useState(true);
  const [demoAdmin, setDemoAdmin] = useState(true);
  const [parser, setParser] = useState<ParserOption>("ollama");
  const [hardware, setHardware] = useState<HardwareOption>("cpu");
  const [writeModel, setWriteModel] = useState<WriteModelOption>("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ReqResponse | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  const resultTitle = useMemo(() => {
    if (networkError) return "Network error";
    if (!response) return "Ready";
    return response.ok ? "Action result" : response.error.code;
  }, [networkError, response]);

  async function submit(nextText = text) {
    setLoading(true);
    setNetworkError(null);
    setText(nextText);

    try {
      const res = await fetch("/api/req", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          text: nextText,
          debug,
          parser,
          llm:
            parser === "ollama"
              ? {
                  hardware,
                  ...(writeModel ? { writeModel } : {})
                }
              : undefined,
          actor: demoAdmin
            ? {
                id: "demo-admin",
                role: "admin"
              }
            : undefined
        })
      });

      const body = (await res.json()) as ReqResponse;
      setResponse(body);
    } catch (error) {
      setResponse(null);
      setNetworkError(error instanceof Error ? error.message : "요청에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">NestJS + SQLite + React</p>
            <h1>NLBackend Example</h1>
          </div>
          <div className="status" aria-label="API proxy target">
            <Server size={16} />
            <span>React /api {"->"} NestJS :3100</span>
          </div>
        </header>

        <div className="layout">
          <section className="panel composer" aria-label="자연어 요청 실행">
            <div className="panelTitle">
              <Database size={17} />
              <span>SQLite-backed /req</span>
            </div>
            <textarea
              aria-label="Natural language request"
              onChange={(event) => setText(event.target.value)}
              placeholder="자연어로 백엔드 요청을 입력하세요."
              rows={7}
              value={text}
            />
            <div className="controls">
              <div className="segmented" aria-label="Parser provider">
                {parserOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      className={parser === option.value ? "segment active" : "segment"}
                      key={option.value}
                      onClick={() => setParser(option.value)}
                      type="button"
                    >
                      <Icon size={15} />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
              {parser === "ollama" ? (
                <div className="segmented compact" aria-label="Local model hardware">
                  {hardwareOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        className={hardware === option.value ? "segment active" : "segment"}
                        key={option.value}
                        onClick={() => setHardware(option.value)}
                        type="button"
                      >
                        <Icon size={15} />
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {parser === "ollama" ? (
                <div className="segmented compact" aria-label="Write-action model">
                  {writeModelOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        className={writeModel === option.value ? "segment active" : "segment"}
                        key={option.value || "same"}
                        onClick={() => setWriteModel(option.value)}
                        type="button"
                        title="update/delete 같은 write 액션에만 쓰는 모델"
                      >
                        <Icon size={15} />
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <label className="toggle">
                <input checked={debug} onChange={(event) => setDebug(event.target.checked)} type="checkbox" />
                <Bug size={16} />
                <span>Debug trace</span>
              </label>
              <label className="toggle">
                <input checked={demoAdmin} onChange={(event) => setDemoAdmin(event.target.checked)} type="checkbox" />
                <UserCog size={16} />
                <span>Demo admin</span>
              </label>
              <button className="run" disabled={loading || text.trim().length === 0} onClick={() => submit()} type="button">
                <Play size={17} fill="currentColor" />
                <span>{loading ? "Running" : "Run"}</span>
              </button>
            </div>
          </section>

          <section className="panel result" aria-live="polite" aria-label="실행 결과">
            <div className="panelTitle">
              <Server size={17} />
              <span>{resultTitle}</span>
            </div>
            <pre>{networkError ? networkError : response ? JSON.stringify(response, null, 2) : "Run a request to inspect the response."}</pre>
          </section>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
