import {
  useState,
  useEffect,
  useId,
  type ReactElement,
  type ReactNode
} from "react";

const CLOSE_ANIMATION_MS = 220;

type CommonModalProps = {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
};

export function CommonModal({
  isOpen,
  title,
  children,
  onClose
}: CommonModalProps): ReactElement | null {
  const titleId = useId();
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [renderState, setRenderState] = useState<"open" | "closed">(
    isOpen ? "open" : "closed"
  );

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const frameId = window.requestAnimationFrame(() => {
        setRenderState("open");
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    if (!shouldRender) {
      return;
    }

    setRenderState("closed");
    const closeTimer = window.setTimeout(() => {
      setShouldRender(false);
    }, CLOSE_ANIMATION_MS);

    return () => {
      window.clearTimeout(closeTimer);
    };
  }, [isOpen, shouldRender]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div className="common-modal-layer" data-state={renderState}>
      <button
        aria-label="关闭弹窗"
        className="common-modal-backdrop"
        data-state={renderState}
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="common-modal-panel"
        data-state={renderState}
        role="dialog"
      >
        <h2 className="common-modal-title" id={titleId}>
          {title}
        </h2>
        {children}
      </section>
    </div>
  );
}
