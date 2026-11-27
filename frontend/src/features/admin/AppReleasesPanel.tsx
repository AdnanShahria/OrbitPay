import { useRef, useState, type FormEvent } from 'react';
import {
  RiCheckboxCircleLine,
  RiDeleteBinLine,
  RiDownloadLine,
  RiErrorWarningLine,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiRefreshLine,
  RiSendPlaneLine,
  RiShieldCheckLine,
  RiSmartphoneLine,
  RiUpload2Line,
} from '@remixicon/react';
import { Chip } from '@/components/base/badges/chip';
import { StatusDot } from '@/components/base/badges/status-dot';
import { Button } from '@/components/base/buttons/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/base/card/card';
import { Input } from '@/components/base/input/input';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import { toast } from '@/components/base/toast/toast';
import { formatDate } from '@/shared/utils/format';
import {
  type AppReleaseItem,
  useAdminReleases,
  useBroadcastAppRelease,
  useDeleteAppRelease,
  usePublishAppRelease,
  useUpdateAppRelease,
} from './useAdmin';

function formatApkSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function AppReleasesPanel() {
  const { data, isLoading, isFetching, refetch } = useAdminReleases(true);
  const publishMutation = usePublishAppRelease();
  const broadcastMutation = useBroadcastAppRelease();
  const updateMutation = useUpdateAppRelease();
  const deleteMutation = useDeleteAppRelease();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const releases = data?.releases ?? [];
  const r2Configured = data?.r2Configured ?? false;
  const highestVersionCode = releases.reduce(
    (max, item) => (item.versionCode > max ? item.versionCode : max),
    1,
  );

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [versionCode, setVersionCode] = useState<string>(String(highestVersionCode + 1));
  const [versionName, setVersionName] = useState<string>('1.0.1');
  const [minSupportedVersionCode, setMinSupportedVersionCode] = useState<string>('1');
  const [releaseNotes, setReleaseNotes] = useState<string>('');
  const [mandatory, setMandatory] = useState<boolean>(false);
  const [notifyDevices, setNotifyDevices] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyReleaseId, setBusyReleaseId] = useState<string | null>(null);

  const handlePublish = async (e: FormEvent) => {
    e.preventDefault();
    if (publishMutation.isPending) return;

    if (!selectedFile) {
      setFormError('Select a signed release .apk file to upload.');
      return;
    }
    if (!selectedFile.name.toLowerCase().endsWith('.apk')) {
      setFormError('Only Android .apk packages are supported.');
      return;
    }

    const parsedVersionCode = Number.parseInt(versionCode.trim(), 10);
    if (!Number.isInteger(parsedVersionCode) || parsedVersionCode < 1) {
      setFormError('Version code must be a positive integer (higher than installed versionCode).');
      return;
    }

    const cleanVersionName = versionName.trim();
    if (!cleanVersionName) {
      setFormError('Version name (e.g. 1.0.1) is required.');
      return;
    }

    const parsedMinSupported = Number.parseInt(minSupportedVersionCode.trim() || '1', 10);
    if (!Number.isInteger(parsedMinSupported) || parsedMinSupported < 1) {
      setFormError('Minimum supported version code must be a positive integer.');
      return;
    }

    if (parsedMinSupported > parsedVersionCode) {
      setFormError('Minimum supported version code cannot exceed the release version code.');
      return;
    }

    setFormError(null);

    const formData = new FormData();
    formData.append('apk', selectedFile);
    formData.append('versionCode', String(parsedVersionCode));
    formData.append('versionName', cleanVersionName);
    formData.append('minSupportedVersionCode', String(parsedMinSupported));
    formData.append('mandatory', String(mandatory));
    formData.append('releaseNotes', releaseNotes.trim());
    formData.append('notifyDevices', String(notifyDevices));

    try {
      const result = await publishMutation.mutateAsync(formData);
      const b = result.broadcast;
      if (b) {
        toast.success(
          `Published v${result.release.versionName} & pushed to ${b.totalDelivered} device(s) (WS: ${b.wsDelivered}, FCM: ${b.fcmDelivered})`,
        );
      } else {
        toast.success(`Published v${result.release.versionName} to R2`);
      }

      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setVersionCode(String(parsedVersionCode + 1));
      setReleaseNotes('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to upload APK release';
      setFormError(msg);
      toast.error(msg);
    }
  };

  const handleBroadcast = async (release: AppReleaseItem) => {
    setBusyReleaseId(release.id);
    try {
      const summary = await broadcastMutation.mutateAsync(release.id);
      toast.success(
        `Update push sent to ${summary.totalDelivered} device(s) across ${summary.merchantsTargeted} merchant(s)`,
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Broadcast failed');
    } finally {
      setBusyReleaseId(null);
    }
  };

  const handleToggleActive = async (release: AppReleaseItem) => {
    setBusyReleaseId(release.id);
    try {
      await updateMutation.mutateAsync({
        id: release.id,
        patch: { isActive: !release.isActive },
      });
      toast.success(
        release.isActive
          ? `Disabled v${release.versionName}`
          : `Activated v${release.versionName}`,
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update release');
    } finally {
      setBusyReleaseId(null);
    }
  };

  const handleToggleMandatory = async (release: AppReleaseItem) => {
    setBusyReleaseId(release.id);
    try {
      await updateMutation.mutateAsync({
        id: release.id,
        patch: { mandatory: !release.mandatory },
      });
      toast.success(
        release.mandatory
          ? `Marked v${release.versionName} as optional`
          : `Marked v${release.versionName} as mandatory`,
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update release');
    } finally {
      setBusyReleaseId(null);
    }
  };

  const handleDelete = async (release: AppReleaseItem) => {
    setBusyReleaseId(release.id);
    try {
      await deleteMutation.mutateAsync(release.id);
      toast.success(`Deleted release v${release.versionName}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete release');
    } finally {
      setBusyReleaseId(null);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Unable to copy ${label}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-title-3-semibold text-text-primary">
            Android Companion OTA &amp; APK Releases
          </h3>
          <p className="text-caption-1-regular text-text-secondary mt-0.5">
            Upload signed APKs to R2 and broadcast OTA updates to companion devices.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Chip
            variant="caption"
            color={r2Configured ? 'lime' : 'yellow'}
            className="gap-1.5"
          >
            <StatusDot color={r2Configured ? 'green' : 'yellow'} />
            <span>{r2Configured ? 'R2 Storage Ready' : 'R2_BUCKET Missing'}</span>
          </Chip>

          <Button
            variant="secondary"
            size="small"
            onClick={() => refetch()}
            isLoading={isFetching && !isLoading}
            leadingIcon={RiRefreshLine}
            className="min-h-11 sm:min-h-10"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Upload & Publish Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
              <RiUpload2Line className="size-4" aria-hidden />
            </span>
            <div>
              <CardTitle>Publish New Android Release</CardTitle>
              <CardDescription>
                Signed with the same release keystore and a strictly higher versionCode.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handlePublish} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Version Code"
                type="number"
                placeholder="2"
                value={versionCode}
                onChange={setVersionCode}
                isRequired
                inputClassName="font-mono tabular-nums"
                hint="Must exceed app/build.gradle.kts versionCode"
              />

              <Input
                label="Version Name"
                placeholder="1.0.1"
                value={versionName}
                onChange={setVersionName}
                isRequired
                inputClassName="font-mono tabular-nums"
                hint="Displayed to merchants (e.g. 1.0.1)"
              />

              <Input
                label="Min Supported Version Code"
                type="number"
                placeholder="1"
                value={minSupportedVersionCode}
                onChange={setMinSupportedVersionCode}
                inputClassName="font-mono tabular-nums"
                hint="Older builds force-update immediately"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="orbit-apk-upload"
                className="block text-caption-1-medium text-text-primary"
              >
                Signed Android APK Package (.apk)
              </label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-dashed border-border-button-default bg-background-secondary-default p-4">
                <input
                  id="orbit-apk-upload"
                  ref={fileInputRef}
                  type="file"
                  accept=".apk,application/vnd.android.package-archive"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setSelectedFile(file);
                  }}
                  className="text-caption-1-regular text-text-secondary file:me-3 file:rounded-xl file:border file:border-border-button-default file:bg-background-primary-default file:px-3 file:py-1.5 file:text-caption-1-medium file:text-text-primary hover:file:bg-background-secondary-hover transition-colors duration-150"
                />
                {selectedFile && (
                  <Chip variant="caption" color="cyan">
                    {selectedFile.name} · {formatApkSize(selectedFile.size)}
                  </Chip>
                )}
              </div>
            </div>

            <Input
              label="Release Notes"
              placeholder="Improved bKash & Nagad parser rules and faster WebSocket reconnect..."
              value={releaseNotes}
              onChange={setReleaseNotes}
              hint="Shown inside the merchant's Android update prompt."
            />

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1">
              <label className="inline-flex items-center gap-2 text-caption-1-medium text-text-primary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={mandatory}
                  onChange={(e) => setMandatory(e.target.checked)}
                  className="size-4 rounded border-border-button-default accent-text-primary"
                />
                Mandatory force update (blocks dismiss)
              </label>

              <label className="inline-flex items-center gap-2 text-caption-1-medium text-text-primary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={notifyDevices}
                  onChange={(e) => setNotifyDevices(e.target.checked)}
                  className="size-4 rounded border-border-button-default accent-text-primary"
                />
                Broadcast instant push via WebSocket + FCM
              </label>
            </div>

            {formError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl bg-notification-error-background border border-border-error-default/20 p-3 text-caption-1-medium text-notification-error-foreground"
              >
                <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
                <span>{formError}</span>
              </div>
            )}

            <div className="flex items-center justify-end">
              <Button
                type="submit"
                variant="primary"
                size="medium"
                isLoading={publishMutation.isPending}
                disabled={!r2Configured}
                leadingIcon={RiUpload2Line}
              >
                Upload &amp; Publish Release
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Release History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
                <RiSmartphoneLine className="size-4" aria-hidden />
              </span>
              <div>
                <CardTitle>Published Releases ({releases.length})</CardTitle>
                <CardDescription>
                  Manifest endpoint: <code className="font-mono">/api/v1/app/latest</code>
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
            </div>
          ) : releases.length === 0 ? (
            <div className="rounded-2xl border border-separator-border bg-background-secondary-default p-6 text-center">
              <p className="text-body-medium text-text-primary">No Android APK releases published yet</p>
              <p className="text-caption-1-regular text-text-secondary mt-1">
                Upload your first signed release build above to enable automatic companion app updates.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {releases.map((release, idx) => {
                const isLatestActive = idx === 0 && release.isActive;
                const isBusy = busyReleaseId === release.id;

                return (
                  <div
                    key={release.id}
                    className="rounded-2xl border border-separator-border bg-background-secondary-default p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-body-semibold text-text-primary font-mono tabular-nums">
                          v{release.versionName}
                        </span>
                        <span className="text-caption-1-regular text-text-tertiary font-mono tabular-nums">
                          (build {release.versionCode})
                        </span>

                        {isLatestActive && (
                          <Chip variant="caption" color="lime" className="gap-1">
                            <RiCheckboxCircleLine className="size-3.5" aria-hidden />
                            <span>Latest Live</span>
                          </Chip>
                        )}

                        <Chip
                          variant="caption"
                          color={release.isActive ? 'cyan' : 'neutral'}
                        >
                          {release.isActive ? 'Active' : 'Disabled'}
                        </Chip>

                        {release.mandatory && (
                          <Chip variant="caption" color="rose" className="gap-1">
                            <RiShieldCheckLine className="size-3.5" aria-hidden />
                            <span>Mandatory</span>
                          </Chip>
                        )}

                        <span className="text-caption-2-regular text-text-tertiary whitespace-nowrap tabular-nums tnum">
                          {formatApkSize(release.sizeBytes)} · minBuild {release.minSupportedVersionCode} ·{' '}
                          {formatDate(release.createdAt)}
                        </span>
                      </div>

                      {release.releaseNotes && (
                        <p className="text-caption-1-regular text-text-secondary">
                          {release.releaseNotes}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 text-caption-2-regular text-text-tertiary font-mono">
                        <span className="truncate max-w-md">SHA-256: {release.sha256}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(release.sha256, 'SHA-256')}
                          className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary cursor-pointer"
                        >
                          <RiFileCopyLine className="size-3.5" aria-hidden />
                          Copy
                        </button>
                        <a
                          href={release.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary"
                        >
                          <RiDownloadLine className="size-3.5" aria-hidden />
                          Download APK
                          <RiExternalLinkLine className="size-3" aria-hidden />
                        </a>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Button
                        variant="primary"
                        size="small"
                        isLoading={isBusy && broadcastMutation.isPending}
                        disabled={isBusy || !release.isActive}
                        onClick={() => handleBroadcast(release)}
                        leadingIcon={RiSendPlaneLine}
                      >
                        Push Update
                      </Button>

                      <Button
                        variant="secondary"
                        size="small"
                        disabled={isBusy}
                        onClick={() => handleToggleMandatory(release)}
                      >
                        {release.mandatory ? 'Make Optional' : 'Make Mandatory'}
                      </Button>

                      <Button
                        variant="secondary"
                        size="small"
                        disabled={isBusy}
                        onClick={() => handleToggleActive(release)}
                      >
                        {release.isActive ? 'Disable' : 'Enable'}
                      </Button>

                      <Button
                        variant="ghost"
                        size="small"
                        disabled={isBusy}
                        onClick={() => handleDelete(release)}
                        leadingIcon={RiDeleteBinLine}
                        title="Delete release from D1 and R2"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
