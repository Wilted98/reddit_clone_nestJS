'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle, Save, X } from 'lucide-react';
import { useId } from 'react';
import { useForm } from 'react-hook-form';
import {
  contentEditDefaults,
  ContentEditFields,
  contentEditSchema,
  EditableContent,
} from '../lib/content-editing';

export function ContentEditForm({
  content,
  pending,
  onSave,
  onCancel,
}: {
  content: EditableContent;
  pending: boolean;
  onSave: (values: ContentEditFields) => Promise<void>;
  onCancel: () => void;
}) {
  const fieldId = useId();
  const defaults = contentEditDefaults(content);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ContentEditFields>({
    resolver: zodResolver(contentEditSchema),
    defaultValues: defaults,
  });
  const busy = pending || isSubmitting;
  const fields =
    defaults.kind === 'comment'
      ? (['body'] as const)
      : defaults.kind === 'link'
        ? (['title', 'url'] as const)
        : (['title', 'body'] as const);
  return (
    <form
      className="content-editor"
      aria-label={`Edit ${content.kind}`}
      noValidate
      onSubmit={(event) => {
        if (busy) {
          event.preventDefault();
          return;
        }
        void handleSubmit(onSave)(event);
      }}
    >
      {fields.map((field) => (
        <div className="form-field" key={field}>
          <label htmlFor={`${fieldId}-${field}`}>
            {field === 'title'
              ? 'Title'
              : field === 'url'
                ? 'URL'
                : content.kind === 'comment'
                  ? 'Comment'
                  : 'Post body'}
          </label>
          {field === 'body' ? (
            <textarea
              id={`${fieldId}-${field}`}
              rows={5}
              {...register(field)}
              disabled={busy}
              autoFocus={fields[0] === field}
              aria-invalid={!!errors[field]}
              aria-describedby={
                errors[field] ? `${fieldId}-${field}-error` : undefined
              }
            />
          ) : (
            <input
              id={`${fieldId}-${field}`}
              type={field === 'url' ? 'url' : 'text'}
              {...register(field)}
              disabled={busy}
              autoFocus={fields[0] === field}
              aria-invalid={!!errors[field]}
              aria-describedby={
                errors[field] ? `${fieldId}-${field}-error` : undefined
              }
            />
          )}
          {errors[field] && (
            <span className="field-error" id={`${fieldId}-${field}-error`}>
              {errors[field]?.message}
            </span>
          )}
        </div>
      ))}
      <div className="form-actions">
        <button
          className="secondary-button"
          type="submit"
          disabled={busy || !isDirty}
        >
          {busy ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <Save size={17} />
          )}
          {busy ? 'Saving...' : 'Save changes'}
        </button>
        <button
          className="text-button"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          <X size={17} />
          Cancel
        </button>
      </div>
    </form>
  );
}
