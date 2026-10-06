'use client';

import { LoaderCircle, X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';

export function ConfirmationDialog({
  title,
  description,
  confirmLabel,
  pendingLabel,
  icon,
  pending,
  onConfirm,
  onCancel,
  trigger,
  fallback,
  children,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  icon: ReactNode;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  trigger: RefObject<HTMLButtonElement | null>;
  fallback?: RefObject<HTMLHeadingElement | null>;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener = trigger.current;
    const returnTarget = fallback?.current;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
      else if (returnTarget?.isConnected) returnTarget.focus();
    };
  }, [trigger, fallback]);
  return (
    <dialog
      ref={dialog}
      className="delete-confirmation"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <h2 className="delete-confirmation-title" id={`${id}-title`}>
        {title}
      </h2>
      <p id={`${id}-description`}>{description}</p>
      {children}
      <div className="content-action-buttons">
        <button
          type="button"
          className="text-button"
          disabled={pending}
          onClick={onCancel}
          autoFocus
        >
          <X size={17} /> Cancel
        </button>
        <button
          type="button"
          className="secondary-button danger-text"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? <LoaderCircle size={17} className="spin" /> : icon}
          {pending ? pendingLabel : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
