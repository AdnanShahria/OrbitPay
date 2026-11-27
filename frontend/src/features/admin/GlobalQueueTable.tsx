import { useState } from 'react';
import { RiFlashlightLine, RiTimeLine } from '@remixicon/react';
import { Chip } from '@/components/base/badges/chip';
import { Button } from '@/components/base/buttons/button';
import { Card } from '@/components/base/card/card';
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
import { useAdminSimulateMutation, type QueueSummaryItem } from './useAdmin';

interface GlobalQueueTableProps {
  queue?: QueueSummaryItem[];
  isLoading: boolean;
  simulatorEnabled?: boolean;
}

export function GlobalQueueTable({
  queue = [],
  isLoading,
  simulatorEnabled = false,
}: GlobalQueueTableProps) {
  const simulateMutation = useAdminSimulateMutation();
  const [matchingTrxId, setMatchingTrxId] = useState<string | null>(null);

  const handleSimulateMatch = async (item: QueueSummaryItem) => {
    setMatchingTrxId(item.submittedTrxId);
    try {
      await simulateMutation.mutateAsync({
        provider: item.provider,
        amount: item.expectedAmount,
        trxId: item.submittedTrxId,
        merchantId: item.merchantId,
      });
      toast.success(`Simulated SMS match for ${item.submittedTrxId}`);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to simulate verification match',
      );
    } finally {
      setTimeout(() => setMatchingTrxId(null), 600);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-title-3-semibold text-text-primary">
          Cross-Storefront Verification Queue
        </h3>
        <p className="text-caption-1-regular text-text-secondary mt-0.5">
          Submitted payment orders awaiting matching companion SMS.
        </p>
      </div>

      <Card variant="default">
        {isLoading ? (
          <div aria-busy="true" className="p-5 space-y-3">
            {[1, 2, 3].map((row) => (
              <div key={row} className="flex items-center justify-between gap-4">
                <Skeleton shape="text" className="h-4 w-32" />
                <Skeleton shape="text" className="h-4 w-24" />
                <Skeleton shape="text" className="h-4 w-28" />
                <Skeleton shape="rect" className="h-8 w-28 rounded-lg" />
              </div>
            ))}
          </div>
        ) : queue.length === 0 ? (
          <div className="py-12 px-6 text-center space-y-2">
            <RiTimeLine
              className="size-8 mx-auto text-foreground-icon-tertiary"
              aria-hidden
            />
            <p className="text-body-medium text-text-primary">
              Verification queue is empty
            </p>
            <p className="text-caption-1-regular text-text-secondary">
              All store verification queues are clear with 0 pending orders waiting for SMS.
            </p>
          </div>
        ) : (
          <Table
            aria-label="Cross-storefront deferred verification queue"
            size="md"
          >
            <TableHeader>
              <TableColumn isRowHeader>Client store</TableColumn>
              <TableColumn>Order ID</TableColumn>
              <TableColumn>Expected BDT</TableColumn>
              <TableColumn>Customer info</TableColumn>
              <TableColumn>Submitted TrxID</TableColumn>
              <TableColumn>Submitted at</TableColumn>
              <TableColumn className="text-end">
                {simulatorEnabled ? 'Instant reconcile' : 'Queue status'}
              </TableColumn>
            </TableHeader>
            <TableBody>
              {queue.map((item) => (
                <TableRow
                  key={item.id}
                  id={item.id}
                  className="hover:bg-background-secondary-default/60"
                >
                  <TableCell className="text-body-medium text-text-primary">
                    <span
                      title={item.storeName || item.merchantId}
                      className="block truncate max-w-[180px]"
                    >
                      {item.storeName || item.merchantId}
                    </span>
                  </TableCell>

                  <TableCell className="font-mono text-body-medium text-text-primary tabular-nums">
                    <span
                      title={item.externalOrderId}
                      className="block truncate max-w-[160px]"
                    >
                      {item.externalOrderId}
                    </span>
                  </TableCell>

                  <TableCell className="font-mono text-body-medium text-status-lime-text tabular-nums tnum whitespace-nowrap">
                    {formatBDT(item.expectedAmount)}
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col min-w-0">
                      <span className="font-mono text-caption-1-medium text-text-primary tabular-nums tnum whitespace-nowrap">
                        {item.submittedSender}
                      </span>
                      <span
                        title={item.customerEmail}
                        className="text-caption-2-regular text-text-tertiary truncate max-w-[180px]"
                      >
                        {item.customerEmail}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Chip
                      variant="caption"
                      color="neutral"
                      title={item.submittedTrxId}
                      className="font-mono whitespace-nowrap"
                    >
                      {item.submittedTrxId}
                    </Chip>
                  </TableCell>

                  <TableCell className="text-caption-1-regular text-text-secondary tabular-nums tnum whitespace-nowrap">
                    {formatDate(new Date(item.createdAt))}
                  </TableCell>

                  <TableCell className="text-end">
                    <div className="shrink-0 flex items-center justify-end gap-1.5">
                      {simulatorEnabled ? (
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => handleSimulateMatch(item)}
                          isLoading={matchingTrxId === item.submittedTrxId}
                          leadingIcon={RiFlashlightLine}
                          title="Simulate companion phone SMS with this exact TrxID to auto-reconcile"
                        >
                          Simulate Match
                        </Button>
                      ) : (
                        <Chip variant="caption" color="yellow">
                          Awaiting SMS
                        </Chip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
