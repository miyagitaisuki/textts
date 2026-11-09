// Thanh quy trình 4 bước nằm dưới thanh công cụ: cho biết việc tiếp theo cần làm.
import { WORKFLOW_STEPS, stepGuidance } from "../lib/workflow.js";

export default function WorkflowBar({ step, dirty, disabled, onStepClick }) {
  return (
    <nav className="workflow" aria-label="Quy trình tạo âm thanh">
      <ol className="workflow-steps">
        {WORKFLOW_STEPS.map((s, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "current" : "todo";
          return (
            <li key={s.key} className={`workflow-step ${state}`}>
              <button
                type="button"
                className="workflow-btn"
                aria-current={n === step ? "step" : undefined}
                title={s.hint}
                disabled={disabled}
                onClick={() => onStepClick(s.key)}
              >
                <span className="workflow-num" aria-hidden="true">{state === "done" ? "✓" : n}</span>
                <span className="workflow-text">
                  <span className="workflow-label">{s.label}</span>
                  <span className="workflow-hint">{s.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="workflow-guidance" role="status">{stepGuidance(step, { dirty })}</p>
    </nav>
  );
}
