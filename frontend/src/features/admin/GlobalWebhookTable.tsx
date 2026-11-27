import { useState, type ComponentType } from 'react';
import {
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiCodeSSlashLine,
  RiRefreshLine,
  RiTimeLine,
  RiWebhookLine,
} from '@remixicon/react';
import { Chip, type ChipColor } from '@/components/base/badges/chip';
import { Button } from '@/components/base/buttons/button';
import { Card } from '@/components/base/card/card';
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@/components/base/modal/modal';
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
import { formatDate } from '@/shared/utils/format';
import { cx } from '@/utils/cx';
import {
  type WebhookDeliverySummary,
  useRetryWebhooksMutation,
} from './useAdmin';

interface GlobalWebhookTableProps {
  webhooks?: WebhookDeliverySummary[];
  isLoading: boolean;
}

type IconComponent = ComponentType<{
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;

const STATUS_STYLE: Record<
  WebhookDeliverySummary['status'],
  { color: ChipColor; icon: IconComponent }
> = {
  DELIVERED: { color: 'lime', icon: RiCheckboxCircleLine },
  FAILED: { color: 'rose', icon: RiCloseCircleLine },
  RETRYING: { color: 'yellow', icon: RiTimeLine },
};

export function GlobalWebhookTable({
  webhooks = [],
  isLoading,
}: GlobalWebhookTableProps) {
  const [selectedWebhook, setSelectedWebhook] =
    useState<WebhookDeliverySummary | null>(null);
  const retryMutation = useRetryWebhooksMutation();

  const handleRetry = async () => {
    try {
      await retryMutation.mutateAsync();
      toast.success('Pending webhook retries dispatched');
    } catch {
      toast.error('Failed to dispatch webhook retries');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-title-3-semibold text-text-primary">
            Cross-Storefront Webhook Audit Trail
          </h3>
          <p className="text-caption-1-regular text-text-secondary mt-0.5">
            Delivery status of HMAC-signed callbacks across all storefronts.
          </p>
        </div>

        <Button
          variant="secondary"
          size="small"
          onClick={handleRetry}
          isLoading={retryMutation.isPending}
          leadingIcon={RiRefreshLine}
          className="min-h-11 sm:min-h-10 shrink-0"
        >
          Dispatch Pending Retries
        </Button>
      </div>

      <Card variant="default">
        {isLoading ? (
          <div aria-busy="true" className="p-5 space-y-3">
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="flex items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <Skeleton shape="text" className="h-3.5 w-32" />
                  <Skeleton shape="text" className="h-3 w-44" />
                </div>
                <Skeleton shape="text" className="h-4 w-20" />
                <Skeleton shape="text" className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : webhooks.length === 0 ? (
          <div className="py-12 px-6 text-center space-y-2">
            <RiWebhookLine
              className="size-8 mx-auto text-foreground-icon-tertiary"
              aria-hidden
            />
            <p className="text-body-medium text-text-primary">
              No webhook deliveries logged yet
            </p>
            <p className="text-caption-1-regular text-text-secondary">
              Test a checkout verification to record outgoing webhook callbacks.
            </p>
          </div>
        ) : (
          <Table aria-label="Cross-storefront webhook audit trail" size="md">
            <TableHeader>
              <TableColumn isRowHeader>Client store</TableColumn>
              <TableColumn>Order ID</TableColumn>
              <TableColumn>Delivery status</TableColumn>
              <TableColumn>HTTP response</TableColumn>
              <TableColumn>Attempts</TableColumn>
              <TableColumn>Last attempted</TableColumn>
              <TableColumn className="text-end">Payload</TableColumn>
            </TableHeader>
            <TableBody>
              {webhooks.map((w) => {
                const statusMeta = STATUS_STYLE[w.status] ?? STATUS_STYLE.RETRYING;
                const StatusIcon = statusMeta.icon;

                return (
                  <TableRow
                    key={w.id}
                    id={w.id}
                    className="hover:bg-background-secondary-default/60"
                  >
                    <TableCell>
                      <div className="flex flex-col min-w-0">
                        <span
                          title={w.storeName || w.merchantId}
                          className="text-body-medium text-text-primary truncate max-w-[180px]"
                        >
                          {w.storeName || w.merchantId}
                        </span>
                        <span
                          title={w.webhookUrl || 'No webhook URL'}
                          className="text-caption-2-regular font-mono text-text-tertiary truncate max-w-[220px]"
                        >
                          {w.webhookUrl || 'No webhook URL'}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="font-mono text-body-medium text-text-primary tabular-nums">
                      <span
                        title={w.externalOrderId}
                        className="block truncate max-w-[160px]"
                      >
                        {w.externalOrderId}
                      </span>
                    </TableCell>

                    <TableCell>
                      <Chip
                        variant="bold"
                        color={statusMeta.color}
                        className="gap-1.5"
                      >
                        <StatusIcon className="size-3.5" aria-hidden />
                        <span>{w.status}</span>
                      </Chip>
                    </TableCell>

                    <TableCell>
                      {w.responseStatus ? (
                        <span
                          className={cx(
                            'font-mono text-caption-1-medium tabular-nums tnum whitespace-nowrap',
                            w.responseStatus >= 200 && w.responseStatus < 300
                              ? 'text-status-lime-text'
                              : 'text-status-rose-text',
                          )}
                        >
                          HTTP {w.responseStatus}
                        </span>
                      ) : (
                        <span className="text-caption-1-regular text-text-tertiary whitespace-nowrap">
                          No response
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="font-mono text-caption-1-medium text-text-secondary tabular-nums tnum whitespace-nowrap">
                      {w.attemptCount} / 5
                    </TableCell>

                    <TableCell className="text-caption-1-regular text-text-secondary tabular-nums tnum whitespace-nowrap">
                      {w.lastAttemptAt
                        ? formatDate(new Date(w.lastAttemptAt))
                        : 'Queued'}
                    </TableCell>

                    <TableCell className="text-end">
                      <div className="shrink-0 flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() => setSelectedWebhook(w)}
                          leadingIcon={RiCodeSSlashLine}
                        >
                          View Body
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Webhook Response Detail Dialog */}
      <Modal
        isOpen={selectedWebhook !== null}
        onOpenChange={(open) => !open && setSelectedWebhook(null)}
        size="md"
      >
        {selectedWebhook && (
          <>
            <ModalHeader
              title={`Webhook: ${selectedWebhook.externalOrderId}`}
              description={`Delivery payload and response details for ${selectedWebhook.storeName || selectedWebhook.merchantId}`}
              icon={RiWebhookLine}
            />
            <ModalBody className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-caption-1-medium text-text-secondary">
                  Target URL
                </p>
                <div className="p-3 rounded-xl bg-background-secondary-default font-mono text-caption-1-regular text-text-primary break-all border border-border-button-default">
                  {selectedWebhook.webhookUrl || 'No webhook URL recorded'}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-caption-1-medium text-text-secondary">
                  Storefront response
                </p>
                <pre className="p-3 rounded-xl bg-background-secondary-default font-mono text-caption-1-regular text-text-primary max-h-48 overflow-y-auto whitespace-pre-wrap break-words border border-border-button-default">
                  {selectedWebhook.responseBody || 'No response body recorded'}
                </pre>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                variant="primary"
                size="medium"
                onClick={() => setSelectedWebhook(null)}
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
