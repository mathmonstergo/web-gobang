import { useEffect, useRef, useState, type ReactElement } from "react";

export type RollingActionLabelValue = "新局" | "认输";

type RollingActionLabelProps = {
  label: RollingActionLabelValue;
};

const ROLL_DURATION_MS = 280;

export function RollingActionLabel({
  label
}: RollingActionLabelProps): ReactElement {
  const [displayedLabel, setDisplayedLabel] =
    useState<RollingActionLabelValue>(label);
  const [previousLabel, setPreviousLabel] =
    useState<RollingActionLabelValue>(label);
  const [isRolling, setIsRolling] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (label === displayedLabel) {
      return;
    }

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setPreviousLabel(displayedLabel);
    setDisplayedLabel(label);
    setIsRolling(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setIsRolling(false);
    }, ROLL_DURATION_MS);
  }, [displayedLabel, label]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <span aria-label={displayedLabel} className="rolling-action-label">
      <span
        aria-hidden="true"
        className={[
          "rolling-action-label-track",
          isRolling ? "is-rolling" : ""
        ].join(" ")}
      >
        <span className="rolling-action-label-text previous">
          {previousLabel}
        </span>
        <span className="rolling-action-label-text current">
          {displayedLabel}
        </span>
      </span>
    </span>
  );
}
