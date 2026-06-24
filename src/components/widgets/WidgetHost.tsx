import { WIDGETS } from "./registry";
import type { WidgetContext } from "./types";
import { useWidgetVisibility } from "./useWidgetVisibility";

const DEFAULT_HIDDEN = WIDGETS.filter((widget) => !widget.enabledByDefault).map(
  (widget) => widget.id,
);

/**
 * Host page for the experimental "Lab" tab. Renders nothing of its own beyond a
 * toggle bar and a card per enabled widget — every visualization is a registry
 * entry, so this file never changes when widgets are added or removed.
 */
export function WidgetHost({ ctx }: { ctx: WidgetContext }) {
  const { hidden, toggle } = useWidgetVisibility(DEFAULT_HIDDEN);
  const visible = WIDGETS.filter((widget) => !hidden.has(widget.id));

  return (
    <div className="view-lab" style={{ display: "block" }}>
      <section className="lab-toolbar">
        <div className="lab-toolbar-head">
          <h2 className="lab-title">Lab</h2>
          <p className="lab-subtitle">
            Experimental visualizations. Toggle any of them on or off — your choice is remembered.
          </p>
        </div>
        <div className="lab-toggles">
          {WIDGETS.map((widget) => (
            <label key={widget.id} className="lab-toggle" data-tip={widget.description}>
              <input
                type="checkbox"
                checked={!hidden.has(widget.id)}
                onChange={() => toggle(widget.id)}
              />
              <span>{widget.title}</span>
            </label>
          ))}
        </div>
      </section>

      {visible.length ? (
        <div className="lab-grid">
          {visible.map((widget) => {
            const Body = widget.component;
            return (
              <section key={widget.id} className="lab-widget">
                <header className="lab-widget-head">
                  <div>
                    <h3>{widget.title}</h3>
                    <p>{widget.description}</p>
                  </div>
                  <button
                    type="button"
                    className="lab-widget-hide"
                    onClick={() => toggle(widget.id)}
                  >
                    Hide
                  </button>
                </header>
                <div className="lab-widget-body">
                  <Body ctx={ctx} />
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="empty">
          <div className="big">All widgets hidden</div>
          <div>Use the toggles above to show a visualization.</div>
        </div>
      )}
    </div>
  );
}
