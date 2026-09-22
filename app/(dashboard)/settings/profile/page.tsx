'use client'

import { LogOut, Trash2, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { ThemeToggle } from '@/components/layout/theme-toggle'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import {
  Avatar,
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/primitives'
import { AVATAR_BUCKET, MAX_AVATAR_BYTES, ROLE_META } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { useUpdateProfile } from '@/lib/queries/workspaces'
import { getTenantSupabaseBrowserClient } from '@/lib/supabase/clients'
import { displayName, errorMessage, formatBytes } from '@/lib/utils'

export default function ProfileSettingsPage() {
  const router = useRouter()
  const { profile, userId, workspaces } = useWorkspaceContext()
  const update = useUpdateProfile()
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = React.useState(false)

  const [form, setForm] = React.useState({ fullName: '', jobTitle: '', timezone: '' })

  React.useEffect(() => {
    setForm({
      fullName: profile?.full_name ?? '',
      jobTitle: profile?.job_title ?? '',
      timezone:
        profile?.timezone ??
        (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : ''),
    })
  }, [profile])

  const dirty =
    profile &&
    (form.fullName !== (profile.full_name ?? '') ||
      form.jobTitle !== (profile.job_title ?? '') ||
      form.timezone !== (profile.timezone ?? ''))

  async function save(event: React.FormEvent) {
    event.preventDefault()
    try {
      await update.mutateAsync({
        id: userId,
        full_name: form.fullName.trim() || null,
        job_title: form.jobTitle.trim() || null,
        timezone: form.timezone.trim() || null,
      })
      toast.success('Profile updated')
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save your profile'))
    }
  }

  async function uploadAvatar(file: File) {
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error(`Pick an image under ${formatBytes(MAX_AVATAR_BYTES)}.`)
      return
    }

    setUploading(true)
    const supabase = getTenantSupabaseBrowserClient()
    // Path must start with the user id — that is what the storage policy checks.
    const extension = file.name.split('.').pop()?.toLowerCase() ?? 'png'
    const path = `${userId}/avatar-${Date.now()}.${extension}`

    try {
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { upsert: true, cacheControl: '3600' })
      if (uploadError) throw uploadError

      const {
        data: { publicUrl },
      } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)

      await update.mutateAsync({ id: userId, avatar_url: publicUrl })
      toast.success('Avatar updated')
    } catch (error) {
      toast.error(errorMessage(error, 'Could not upload the image'))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="max-w-2xl space-y-4 p-3 sm:p-4">
      <Card>
        <form onSubmit={save}>
          <CardHeader>
            <CardTitle>Your profile</CardTitle>
            <CardDescription>
              Your name and avatar are visible to everyone in your workspaces.
            </CardDescription>
          </CardHeader>

          <div className="space-y-4 px-4 pb-4 sm:px-5">
            <div className="flex items-center gap-4">
              <Avatar
                id={userId}
                name={profile?.full_name ?? profile?.email}
                src={profile?.avatar_url}
                size="xl"
              />
              <div className="space-y-2">
                <input
                  ref={inputRef}
                  id="avatar-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) uploadAvatar(file)
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={uploading}
                    onClick={() => inputRef.current?.click()}
                  >
                    <Upload />
                    Upload image
                  </Button>
                  {profile?.avatar_url ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => update.mutate({ id: userId, avatar_url: null })}
                    >
                      <Trash2 />
                      Remove
                    </Button>
                  ) : null}
                </div>
                <p className="text-2xs text-muted-foreground">
                  PNG, JPEG, WebP or GIF up to {formatBytes(MAX_AVATAR_BYTES)}.
                </p>
              </div>
            </div>

            <Field label="Display name" htmlFor="profile-name">
              <Input
                id="profile-name"
                value={form.fullName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, fullName: event.target.value }))
                }
                placeholder={displayName(profile)}
                maxLength={80}
              />
            </Field>

            <Field label="Email" htmlFor="profile-email" hint="Managed by your sign-in method.">
              <Input id="profile-email" value={profile?.email ?? ''} readOnly disabled />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Job title" htmlFor="profile-title">
                <Input
                  id="profile-title"
                  value={form.jobTitle}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, jobTitle: event.target.value }))
                  }
                  placeholder="Senior engineer"
                  maxLength={80}
                />
              </Field>
              <Field label="Time zone" htmlFor="profile-tz">
                <Input
                  id="profile-tz"
                  value={form.timezone}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, timezone: event.target.value }))
                  }
                  placeholder="Europe/London"
                  maxLength={64}
                />
              </Field>
            </div>

            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={!dirty} loading={update.isPending}>
                Save profile
              </Button>
            </div>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            MIRA follows your operating system by default. Your choice is stored in this browser.
          </CardDescription>
        </CardHeader>
        <div className="px-4 pb-4 sm:px-5">
          <ThemeToggle />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
          <CardDescription>Where you are a member, and with which role.</CardDescription>
        </CardHeader>
        <ul className="divide-y divide-border border-t border-border">
          {workspaces.map((workspace) => (
            <li
              key={workspace.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{workspace.name}</p>
                <p className="text-2xs text-muted-foreground">
                  Joined {formatDate(workspace.created_at)}
                </p>
              </div>
              <Badge className={ROLE_META[workspace.role].className} size="md">
                {ROLE_META[workspace.role].label}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <div className="px-4 pb-4 sm:px-5">
          <Button
            variant="secondary"
            onClick={async () => {
              await fetch('/auth/signout', { method: 'POST' })
              router.push('/login')
              router.refresh()
            }}
          >
            <LogOut />
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  )
}
