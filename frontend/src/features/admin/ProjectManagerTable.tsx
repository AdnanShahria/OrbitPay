import { useState } from 'react';
import {
  RiAddLine,
  RiCheckLine,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiPauseLine,
  RiPlayLine,
  RiShieldKeyholeLine,
  RiShieldUserLine,
  RiSmartphoneLine,
  RiSparklingLine,
  RiStore2Line,
} from '@remixicon/react';
import { Chip } from '@/components/base/badges/chip';
import { StatusDot } from '@/components/base/badges/status-dot';
import { Button } from '@/components/base/buttons/button';
import { Card } from '@/components/base/card/card';
import { Input } from '@/components/base/input/input';
import {
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
import { ProjectUsersModal } from './ProjectUsersModal';
import {
  type AdminProjectSummary,
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
  const [selectedCreds, setSelectedCreds] = useState<AdminProjectSummary | null>(
    null,
  );
  const [selectedUsersProject, setSelectedUsersProject] = useState<AdminProjectSummary | null>(
    null,
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const updateMutation = useUpdateProjectMutation();
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
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary flex items-center justify-center shrink-0">
                        <RiStore2Line className="size-4" aria-hidden />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-body-medium text-text-primary truncate">
                          {p.storeName}
                        </span>
                        <span className="text-caption-2-regular font-mono text-text-tertiary truncate">
                          {p.id}
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
                    <div className="flex items-center gap-2">
                      <StatusDot color={p.isOnline ? 'green' : 'yellow'} />
                      <span className="text-caption-1-medium text-text-secondary">
                        {p.isOnline ? 'Phone online' : 'Offline'}
                      </span>
                    </div>
                    <span className="text-caption-2-regular text-text-tertiary block mt-0.5 tabular-nums">
                      {p.lastSeenAt
                        ? `Seen ${formatDate(new Date(p.lastSeenAt))}`
                        : 'No device paired'}
                    </span>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1.5 text-body-medium font-mono text-text-primary tabular-nums">
                      <RiSmartphoneLine
                        className="size-4 text-foreground-icon-tertiary"
                        aria-hidden
                      />
                      <span>{p.walletsCount} SIMs</span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="text-body-medium font-mono text-status-lime-text tabular-nums">
                      {formatBDT(p.totalVolume)}
                    </div>
                    <span className="text-caption-2-regular text-text-tertiary block tabular-nums">
                      {p.verifiedCount} verified / {p.unclaimedCount} unclaimed
                    </span>
                  </TableCell>

                  <TableCell>
                    {p.webhookUrl ? (
                      <div className="flex items-center gap-1.5 max-w-xs">
                        <span className="text-caption-1-medium font-mono text-text-secondary truncate">
                          {p.webhookUrl}
                        </span>
                        <a
                          href={p.webhookUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open webhook URL for ${p.storeName}`}
                          className="text-foreground-icon-tertiary hover:text-foreground-icon-primary transition-colors shrink-0"
                        >
                          <RiExternalLinkLine className="size-3.5" aria-hidden />
                        </a>
                      </div>
                    ) : (
                      <span className="text-caption-1-regular text-text-tertiary">
                        Not configured (testing)
                      </span>
                    )}
                    <span className="text-caption-2-regular text-text-tertiary block mt-0.5 tabular-nums">
                      Grace: {p.gracePeriodMinutes} mins
                    </span>
                  </TableCell>

                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => setSelectedUsersProject(p)}
                        leadingIcon={RiShieldUserLine}
                        title="Manage provisioned client users and JWT sessions"
                      >
                        Users &amp; Auth
                      </Button>

                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => setSelectedCreds(p)}
                        leadingIcon={RiShieldKeyholeLine}
                        title="View HMAC Webhook Secret & Device Key"
                      >
                        Creds
                      </Button>

                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => handleToggleActive(p)}
                        isLoading={updateMutation.isPending}
                        leadingIcon={p.isActive ? RiPauseLine : RiPlayLine}
                        title={
                          p.isActive ? 'Pause Storefront' : 'Resume Storefront'
                        }
                      >
                        {p.isActive ? 'Pause' : 'Resume'}
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

      {/* Provisioned Users & JWT Sessions Modal */}
      <ProjectUsersModal
        project={selectedUsersProject}
        onClose={() => setSelectedUsersProject(null)}
      />

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
