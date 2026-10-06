'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle, Save, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { SessionQuery } from '../graphql/generated/auth';
import { socialActionError } from '../lib/errors';
import { ProfileFields, profilePatch, profileSchema } from '../lib/profile';
import { useSession } from './session-provider';

export function ProfileSettingsForm({
  account,
  onCancel,
}: {
  account: SessionQuery['me'];
  onCancel: () => void;
}) {
  const session = useSession();
  const lock = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFields>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      bio: account.bio ?? '',
      avatarUrl: account.avatarUrl ?? '',
    },
  });
  const bio = useWatch({ control, name: 'bio' });

  async function submit(values: ProfileFields) {
    if (lock.current) return;
    const input = profilePatch(values, account);
    if (!Object.keys(input).length) return;
    lock.current = true;
    setSaved(false);
    setFailure(null);
    try {
      await session.updateProfile(input);
      reset(values);
      setSaved(true);
    } catch (error) {
      setFailure(socialActionError(error));
    } finally {
      lock.current = false;
    }
  }

  return (
    <form
      className="profile-settings"
      aria-label="Profile settings"
      noValidate
      onSubmit={(event) => {
        if (lock.current) {
          event.preventDefault();
          return;
        }
        void handleSubmit(submit)(event);
      }}
    >
      <h2>Edit profile</h2>
      <div className="form-field">
        <label htmlFor="profile-bio">Bio</label>
        <textarea
          id="profile-bio"
          rows={4}
          {...register('bio')}
          disabled={isSubmitting}
          aria-invalid={!!errors.bio}
          aria-describedby={
            errors.bio ? 'bio-counter bio-error' : 'bio-counter'
          }
        />
        <span id="bio-counter" className="field-counter">
          {bio.length}/300
        </span>
        {errors.bio && (
          <span className="field-error" id="bio-error">
            {errors.bio.message}
          </span>
        )}
      </div>
      <div className="form-field">
        <label htmlFor="profile-avatar-url">Avatar URL</label>
        <input
          id="profile-avatar-url"
          type="url"
          {...register('avatarUrl')}
          disabled={isSubmitting}
          aria-invalid={!!errors.avatarUrl}
          aria-describedby={errors.avatarUrl ? 'avatar-error' : undefined}
        />
        {errors.avatarUrl && (
          <span className="field-error" id="avatar-error">
            {errors.avatarUrl.message}
          </span>
        )}
      </div>
      {failure && (
        <p className="error-message" role="alert">
          {failure}
        </p>
      )}
      {saved && !isDirty && (
        <p className="form-notice" role="status">
          Profile saved.
        </p>
      )}
      <div className="profile-form-actions">
        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting || !isDirty}
        >
          {isSubmitting ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Save size={18} />
          )}
          {isSubmitting ? 'Saving...' : 'Save changes'}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={isSubmitting}
          onClick={onCancel}
        >
          <X size={18} /> Cancel
        </button>
      </div>
    </form>
  );
}
