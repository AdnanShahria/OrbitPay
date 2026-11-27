import { useState, type FormEvent } from 'react';
import {
  RiAddLine,
  RiCheckLine,
  RiDeleteBinLine,
  RiEditLine,
  RiErrorWarningLine,
  RiExternalLinkLine,
  RiEyeLine,
  RiFileCopyLine,
  RiGlobalLine,
  RiPauseLine,
  RiPlayLine,
  RiShieldKeyholeLine,
  RiShieldUserLine,
  RiSmartphoneLine,
  RiSparklingLine,
  RiStore2Line,
  RiTimeLine,
} from '@remixicon/react';
import { Chip } from '@/components/base/badges/chip';
import { StatusDot } from '@/components/base/badges/status-dot';
import { Button } from '@/components/base/buttons/button';
import { Card } from '@/components/base/card/card';
import { Input } from '@/components/base/input/input';
import {
  AlertDialog,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@/components/base/modal/modal';
import { SearchField } from '@/components/base/search-field/search-field';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@/components/base/table/table';
import { toast } from '@/components/base/toast/toast';
import { formatBDT, formatDate } from '@/shared/utils/format';
import { AddProjectModal } from './AddProjectModal';
import { ProjectInspectDrawer } from './ProjectInspectDrawer';
import { ProjectUsersModal } from './ProjectUsersModal';
import {
  type AdminProjectSummary,
  useDeleteProjectMutation,
  useSeedDemoProjectsMutation,
  useUpdateProjectMutation,
} from './useAdmin';

interface ProjectManagerTableProps {
  projects?: AdminProjectSummary[];
  isLoading: boolean;
}

export function ProjectManagerTable({
  projects = [],
  isLoading,
}: ProjectManagerTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCreds, setSelectedCreds] = useState<AdminProjectSummary | null>(null);
  const [selectedUsersProject, setSelectedUsersProject] = useState<AdminProjectSummary | null>(null);
  const [inspectedProject, setInspectedProject] = useState<AdminProjectSummary | null>(null);

  // Edit modal state
  const [editingProject, setEditingProject] = useState<AdminProjectSummary | null>(null);
  const [editStoreName, setEditStoreName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editWebhookUrl, setEditWebhookUrl] = useState('');
  const [editGracePeriod, setEditGracePeriod] = useState('60');
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation state
  const [deletingProject, setDeletingProject] = useState<AdminProjectSummary | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const updateMutation = useUpdateProjectMutation();
  const deleteMutation = useDeleteProjectMutation();
  const seedMutation = useSeedDemoProjectsMutation();

  const filteredProjects = projects.filter(
    (p) =>
      p.storeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.webhookUrl.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleToggleActive = async (p: AdminProjectSummary) => {
    try {
      await updateMutation.mutateAsync({
        id: p.id,
        updates: { isActive: !p.isActive },
      });
      toast.success(
        p.isActive ? `${p.storeName} paused` : `${p.storeName} resumed`,
      );
    } catch {
      toast.error(`Failed to update ${p.storeName}`);
    }
  };

  const openEditModal = (p: AdminProjectSummary) => {
    setEditingProject(p);
    setEditStoreName(p.storeName);
    setEditSlug(p.slug || '');
    setEditWebhookUrl(p.webhookUrl || '');
    setEditGracePeriod(String(p.gracePeriodMinutes || 60));
    setEditError(null);
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingProject || updateMutation.isPending) return;

    const trimmedName = editStoreName.trim();
    const trimmedWebhook = editWebhookUrl.trim();
    const parsedGrace = Number(editGracePeriod);

    if (trimmedName.length < 2) {
      setEditError('Storefront name must be at least 2 characters.');
      return;
    }
    if (!Number.isInteger(parsedGrace) || parsedGrace < 5 || parsedGrace > 1440) {
      setEditError('Grace period must be an integer between 5 and 1440 minutes.');
      return;
    }

    setEditError(null);
    try {
      await updateMutation.mutateAsync({
        id: editingProject.id,
        updates: {
          storeName: trimmedName,
          ...(editSlug.trim() ? { slug: editSlug.trim().toLowerCase() } : {}),
          webhookUrl: trimmedWebhook,
          gracePeriodMinutes: parsedGrace,
        },
      });
      toast.success(`Updated ${trimmedName}`);
      setEditingProject(null);
    } catch (err: unknown) {
      setEditError(
        err instanceof Error ? err.message : 'Failed to update storefront settings',
      );
    }
  };

  const openDeleteDialog = (p: AdminProjectSummary) => {
    setDeletingProject(p);
    setDeleteConfirmInput('');
  };

  const isDeleteMatch = Boolean(
    deletingProject &&
      (deleteConfirmInput.trim() === deletingProject.id ||
        deleteConfirmInput.trim() === deletingProject.storeName),
  );

  const handleConfirmDelete = async () => {
    if (!deletingProject || !isDeleteMatch) return;
    try {
      await deleteMutation.mutateAsync(deletingProject.id);
      toast.success(`Deleted storefront ${deletingProject.storeName}`);
      setDeletingProject(null);
      setDeleteConfirmInput('');
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to delete storefront',
      );
      throw err;
    }
  };

  const handleSeedDemo = async () => {
    try {
      await seedMutation.mutateAsync();
      toast.success('Demo storefronts seeded');
    } catch {
      toast.error('Failed to seed demo storefronts');
    }
  };

  const handleCopy = (text: string, keyId: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Table Actions Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <SearchField
          aria-label="Search client projects"
          placeholder="Search client projects, store names, IDs..."
          value={searchTerm}
          onChange={setSearchTerm}
          shape="pill"
          className="flex-1 max-w-md"
        />

        <div className="flex items-center gap-2.5">
          {projects.length <= 1 && (
            <Button
              variant="secondary"
              size="small"
              onClick={handleSeedDemo}
              isLoading={seedMutation.isPending}
              leadingIcon={RiSparklingLine}
              title="Populates realistic client storefronts (Aurelia, NewznBD, Orbit Cloud Store)"
            >
              Seed Demo Stores
            </Button>
          )}

          <Button
            variant="primary"
            size="small"
            onClick={() => setIsAddModalOpen(true)}
            leadingIcon={RiAddLine}
          >
            Connect Storefront
          </Button>
        </div>
      </div>

      {/* Projects Table Card */}
      <Card variant="default">
        {isLoading ? (
          <div aria-busy="true" className="p-5 space-y-3">
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Skeleton shape="rect" className="size-9 rounded-xl" />
                  <div className="space-y-1.5">
                    <Skeleton shape="text" className="h-3.5 w-36" />
                    <Skeleton shape="text" className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton shape="text" className="h-4 w-20" />
                <Skeleton shape="text" className="h-4 w-24" />
              </div>
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="py-12 px-6 text-center space-y-2">
            <RiStore2Line
              className="size-8 mx-auto text-foreground-icon-tertiary"
              aria-hidden
            />
            <p className="text-body-medium text-text-primary">
              No connected storefront projects
            </p>
            <p className="text-caption-1-regular text-text-secondary">
              {searchTerm
                ? `No projects found matching "${searchTerm}".`
                : 'Connect a client storefront or seed demo stores to begin monitoring.'}
            </p>
          </div>
        ) : (
          <Table aria-label="Connected storefront projects" size="md">
            <TableHeader>
              <TableColumn isRowHeader>Client storefront</TableColumn>
              <TableColumn>Status</TableColumn>
              <TableColumn>Device fleet</TableColumn>
              <TableColumn>SIM pool</TableColumn>
              <TableColumn>Gross verified</TableColumn>
              <TableColumn>Webhook target</TableColumn>
              <TableColumn className="text-end">Actions</TableColumn>
            </TableHeader>
            <TableBody>
              {filteredProjects.map((p) => (
                <TableRow
                  key={p.id}
                  id={p.id}
                  className="hover:bg-background-secondary-default/60"
                >
                  <TableCell>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-9 rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary flex items-center justify-center shrink-0">
                        <RiStore2Line className="size-4" aria-hidden />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span
                          title={p.storeName}
                          className="text-body-medium text-text-primary truncate max-w-[200px]"
                        >
                          {p.storeName}
                        </span>
                        <span
                          title={p.id}
                          className="text-caption-2-regular font-mono text-text-tertiary truncate max-w-[200px]"
                        >
                          {p.slug ? `/${p.slug}/... · ` : ''}{p.id}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Chip variant="bold" color={p.isActive ? 'lime' : 'neutral'}>
                      {p.isActive ? 'Active' : 'Paused'}
                    </Chip>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <StatusDot color={p.isOnline ? 'green' : 'yellow'} />
                      <span className="text-caption-1-medium text-text-secondary">
                        {p.isOnline ? 'Phone online' : 'Offline'}
                      </span>
                    </div>
                    <span className="text-caption-2-regular text-text-tertiary block mt-0.5 whitespace-nowrap tabular-nums tnum">
                      {p.lastSeenAt
                        ? `Seen ${formatDate(new Date(p.lastSeenAt))}`
                        : 'No device paired'}
                    </span>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1.5 text-body-medium font-mono text-text-primary whitespace-nowrap tabular-nums tnum">
                      <RiSmartphoneLine
                        className="size-4 text-foreground-icon-tertiary shrink-0"
                        aria-hidden
                      />
                      <span>{p.walletsCount} SIMs</span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="text-body-medium font-mono text-status-lime-text whitespace-nowrap tabular-nums tnum">
                      {formatBDT(p.totalVolume)}
                    </div>
                    <span className="text-caption-2-regular text-text-tertiary block whitespace-nowrap tabular-nums tnum">
                      {p.verifiedCount} verified / {p.unclaimedCount} unclaimed
                    </span>
                  </TableCell>

                  <TableCell>
                    {p.webhookUrl ? (
                      <div className="flex items-center gap-1.5 max-w-[220px]">
                        <span
                          title={p.webhookUrl}
                          className="text-caption-1-medium font-mono text-text-secondary truncate"
                        >
                          {p.webhookUrl}
                        </span>
                        <a
                          href={p.webhookUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open webhook URL for ${p.storeName}`}
                          className="text-foreground-icon-tertiary hover:text-foreground-icon-primary transition-colors duration-150 shrink-0"
                        >
                          <RiExternalLinkLine className="size-3.5" aria-hidden />
                        </a>
                      </div>
                    ) : (
                      <span className="text-caption-1-regular text-text-tertiary whitespace-nowrap">
                        Not configured
                      </span>
                    )}
                    <span className="text-caption-2-regular text-text-tertiary block mt-0.5 whitespace-nowrap tabular-nums tnum">
                      Grace: {p.gracePeriodMinutes} mins
                    </span>
                  </TableCell>

                  <TableCell className="text-end">
                    <div className="shrink-0 flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setInspectedProject(p)}
                        leadingIcon={RiEyeLine}
                        title="Inspect SIM wallets, SMS ledger, and orders"
                      >
                        Inspect
                      </Button>

                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => openEditModal(p)}
                        leadingIcon={RiEditLine}
                        title="Edit storefront settings"
                      >
                        Edit
                      </Button>

                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setSelectedUsersProject(p)}
                        leadingIcon={RiShieldUserLine}
                        title="Manage provisioned client users and JWT sessions"
                      >
                        Users
                      </Button>

                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setSelectedCreds(p)}
                        leadingIcon={RiShieldKeyholeLine}
                        title="View HMAC Webhook Secret & Device Key"
                      >
                        Creds
                      </Button>

                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleToggleActive(p)}
                        isLoading={updateMutation.isPending}
                        leadingIcon={p.isActive ? RiPauseLine : RiPlayLine}
                        title={
                          p.isActive ? 'Pause Storefront' : 'Resume Storefront'
                        }
                      >
                        {p.isActive ? 'Pause' : 'Resume'}
                      </Button>

                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => openDeleteDialog(p)}
                        leadingIcon={RiDeleteBinLine}
                        className="text-text-destructive"
                        title="Delete Storefront"
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Add Project Modal */}
      <AddProjectModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />

      {/* Live Project Inspection Drawer */}
      <ProjectInspectDrawer
        project={inspectedProject}
        onClose={() => setInspectedProject(null)}
      />

      {/* Provisioned Users & JWT Sessions Modal */}
      <ProjectUsersModal
        project={selectedUsersProject}
        onClose={() => setSelectedUsersProject(null)}
      />

      {/* Edit Storefront Modal */}
      <Modal
        isOpen={editingProject !== null}
        onOpenChange={(open) => !open && setEditingProject(null)}
        size="md"
      >
        {editingProject && (
          <form onSubmit={handleSaveEdit} className="flex min-h-0 flex-1 flex-col gap-4">
            <ModalHeader
              title={`Edit Storefront: ${editingProject.storeName}`}
              description={`Update storefront metadata and callback settings for ${editingProject.id}.`}
              icon={RiEditLine}
            />
            <ModalBody className="space-y-4">
              <Input
                label="Storefront Name"
                value={editStoreName}
                onChange={setEditStoreName}
                leadingIcon={RiStore2Line}
                isRequired
              />
              <Input
                label="Payment Link Handle (Slug)"
                value={editSlug}
                onChange={(val) => setEditSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="e.g. aurelia-bd"
                hint={`payment.orbitsaas.cloud/${editSlug || 'store-handle'}/slug`}
                inputClassName="font-mono"
              />
              <Input
                label="Store Webhook Callback URL"
                type="url"
                placeholder="https://client-store.com/payment/v1"
                value={editWebhookUrl}
                onChange={setEditWebhookUrl}
                leadingIcon={RiGlobalLine}
                inputClassName="font-mono"
                hint="Leave empty if only verifying payments via portal."
              />
              <Input
                label="Grace Period (Minutes)"
                type="number"
                value={editGracePeriod}
                onChange={setEditGracePeriod}
                leadingIcon={RiTimeLine}
                inputClassName="font-mono tabular-nums"
                hint="Accepted range: 5 to 1440 minutes."
              />

              {editError && (
                <div
                  role="alert"
                  className="rounded-xl border border-border-error-default/20 bg-notification-error-background px-3 py-2 text-caption-1-medium text-notification-error-foreground flex items-center gap-2"
                >
                  <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
                  <span>{editError}</span>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button
                type="button"
                variant="ghost"
                size="medium"
                onClick={() => setEditingProject(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="medium"
                isLoading={updateMutation.isPending}
              >
                Save Changes
              </Button>
            </ModalFooter>
          </form>
        )}
      </Modal>

      {/* Delete Storefront AlertDialog */}
      <AlertDialog
        isOpen={deletingProject !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingProject(null);
            setDeleteConfirmInput('');
          }
        }}
        variant="danger"
        title={
          deletingProject
            ? `Delete ${deletingProject.storeName}?`
            : 'Delete storefront?'
        }
        description="This permanently removes the storefront, its SIM wallets, merchant accounts, and ledger associations. This action cannot be undone."
        confirmLabel="Delete Storefront"
        pendingLabel="Deleting..."
        isConfirmDisabled={!isDeleteMatch}
        onConfirm={handleConfirmDelete}
      >
        {deletingProject && (
          <div className="space-y-3 pt-1">
            <p className="text-caption-1-regular text-text-secondary">
              Type{' '}
              <span className="font-mono text-text-primary">{deletingProject.id}</span>{' '}
              or{' '}
              <span className="font-mono text-text-primary">{deletingProject.storeName}</span>{' '}
              to confirm deletion.
            </p>
            <Input
              aria-label="Confirm storefront deletion"
              placeholder={deletingProject.id}
              value={deleteConfirmInput}
              onChange={setDeleteConfirmInput}
              inputClassName="font-mono"
            />
          </div>
        )}
      </AlertDialog>

      {/* Credentials Dialog */}
      <Modal
        isOpen={selectedCreds !== null}
        onOpenChange={(open) => !open && setSelectedCreds(null)}
        size="md"
      >
        {selectedCreds && (
          <>
            <ModalHeader
              title={`Credentials: ${selectedCreds.storeName}`}
              description="Cryptographic keys and pairing parameters for third-party storefront and companion device."
              icon={RiShieldKeyholeLine}
            />
            <ModalBody className="space-y-4">
              <div className="flex items-end gap-2">
                <Input
                  label="Project / Merchant ID"
                  isReadOnly
                  value={selectedCreds.id}
                  className="flex-1"
                  inputClassName="font-mono"
                />
                <Button
                  variant="secondary"
                  size="medium"
                  onClick={() =>
                    handleCopy(selectedCreds.id, 'id', 'Project ID')
                  }
                  leadingIcon={
                    copiedKey === 'id' ? RiCheckLine : RiFileCopyLine
                  }
                >
                  {copiedKey === 'id' ? 'Copied' : 'Copy'}
                </Button>
              </div>

              <div className="flex items-end gap-2">
                <Input
                  label="HMAC Webhook Secret"
                  isReadOnly
                  value={selectedCreds.webhookSecret}
                  className="flex-1"
                  inputClassName="font-mono text-caption-1-regular"
                />
                <Button
                  variant="secondary"
                  size="medium"
                  onClick={() =>
                    handleCopy(
                      selectedCreds.webhookSecret,
                      'whsec',
                      'HMAC webhook secret',
                    )
                  }
                  leadingIcon={
                    copiedKey === 'whsec' ? RiCheckLine : RiFileCopyLine
                  }
                >
                  {copiedKey === 'whsec' ? 'Copied' : 'Copy'}
                </Button>
              </div>

              <Input
                label="Storefront Callback URL"
                isReadOnly
                value={selectedCreds.webhookUrl || 'Not configured'}
                inputClassName="font-mono text-caption-1-regular"
              />
            </ModalBody>
            <ModalFooter>
              <Button
                variant="primary"
                size="medium"
                onClick={() => setSelectedCreds(null)}
              >
                Close
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>
    </div>
  );
}
