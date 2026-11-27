import { useState } from 'react';
import { useTransactions, Transaction, TransactionStatus } from './useTransactions';
import { UnclaimedModal } from './UnclaimedModal';
import { Card } from '@/components/base/card/card';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/base/table/table';
import { Button } from '@/components/base/buttons/button';
import { SearchField } from '@/components/base/search-field/search-field';
import { Select, SelectItem } from '@/components/base/select/select';
import { PillTabList, PillTab } from '@/components/base/tabs/pill-tab';
import { Chip } from '@/components/base/badges/chip';
import { StatusDot } from '@/components/base/badges/status-dot';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import { toast } from '@/components/base/toast/toast';
import { cx } from '@/utils/cx';
import { formatBDT, formatDate, MfsProvider, MFS_METADATA } from '@/shared/utils/format';
import {
  RiToolsLine,
  RiFileCopyLine,
  RiCheckLine,
  RiFilter3Line,
  RiErrorWarningLine,
} from '@remixicon/react';

const TRUST_FLAG_META: Record<string, { label: string; description: string }> = {
  LEGACY_UNVERIFIED_SENDER: {
    label: 'Unverified sender',
    description:
      'LEGACY_UNVERIFIED_SENDER: SMS arrived without an originating sender address and is excluded from auto-verification.',
  },
  UNTRUSTED_SENDER: {
    label: 'Suspicious sender',
    description:
      'UNTRUSTED_SENDER: Originating sender is a personal phone number or untrusted app package.',
  },
  PARSE_MISMATCH: {
    label: 'Parse mismatch',
    description:
      'PARSE_MISMATCH: Server re-parse of the raw SMS did not match the reported TrxID or amount.',
  },
};

function getTrustFlagMeta(flag: string): { label: string; description: string } {
  return (
    TRUST_FLAG_META[flag] ?? {
      label: 'Flagged',
      description: `${flag}: Transaction failed server trust checks and is excluded from auto-verification.`,
    }
  );
}

export function TransactionTable() {
  const [selectedStatus, setSelectedStatus] = useState<TransactionStatus | 'ALL'>('ALL');
  const [selectedProvider, setSelectedProvider] = useState<MfsProvider | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUnclaimed, setSelectedUnclaimed] = useState<Transaction | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: transactions, isLoading } = useTransactions({
    status: selectedStatus,
    provider: selectedProvider,
    search: searchQuery,
  });

  const handleCopy = (trxId: string) => {
    navigator.clipboard.writeText(trxId);
    setCopiedId(trxId);
    toast.success('TrxID copied', { description: trxId });
    setTimeout(() => setCopiedId(null), 1800);
  };

  const statusFilters: Array<{ label: string; value: TransactionStatus | 'ALL' }> = [
    { label: 'All transactions', value: 'ALL' },
    { label: 'Verified', value: 'VERIFIED' },
    { label: 'Unclaimed', value: 'UNCLAIMED' },
    { label: 'Manual verified', value: 'MANUAL_VERIFIED' },
  ];

  const providerFilters: Array<{ label: string; value: MfsProvider | 'ALL' }> = [
    { label: 'All providers', value: 'ALL' },
    { label: 'bKash', value: 'BKASH' },
    { label: 'Nagad', value: 'NAGAD' },
    { label: 'Rocket', value: 'ROCKET' },
    { label: 'Upay', value: 'UPAY' },
    { label: 'Cellfin', value: 'CELLFIN' },
  ];

  return (
    <div className="flex w-full flex-col gap-4">
      <Card>
        {/* Filters Toolbar */}
        <div className="flex flex-col justify-between gap-3 border-b border-separator-border p-4 sm:p-5 lg:flex-row lg:items-center">
          <SearchField
            aria-label="Search transactions"
            placeholder="Search TrxID, sender, or order..."
            value={searchQuery}
            onChange={setSearchQuery}
            shape="pill"
            className="w-full lg:w-72"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <PillTabList
              aria-label="Filter transactions by status"
              className="flex-wrap"
            >
              {statusFilters.map((f) => (
                <PillTab
                  key={f.value}
                  variant="gray"
                  isSelected={selectedStatus === f.value}
                  onSelect={() => setSelectedStatus(f.value)}
                >
                  {f.label}
                </PillTab>
              ))}
            </PillTabList>

            <div className="flex items-center gap-2">
              <RiFilter3Line className="size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
              <Select
                aria-label="Filter by MFS provider"
                size="md"
                selectedKey={selectedProvider}
                onSelectionChange={(key) => {
                  if (key != null) setSelectedProvider(String(key) as MfsProvider | 'ALL');
                }}
                className="min-w-[152px]"
              >
                {providerFilters.map((p) => (
                  <SelectItem key={p.value} id={p.value} textValue={p.label}>
                    {p.label}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {/* Ledger Table or Loading / Empty States */}
        {isLoading ? (
          <div aria-busy="true" aria-label="Loading transaction ledger" className="space-y-3 p-5">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : !transactions || transactions.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-body-medium text-text-primary">No matching transactions</p>
            <p className="mt-1 text-caption-1-regular text-text-secondary">
              No transactions found matching your current search or filter criteria.
            </p>
          </div>
        ) : (
          <Table aria-label="Transaction ledger">
            <TableHeader>
              <TableColumn isRowHeader>Provider and TrxID</TableColumn>
              <TableColumn>Amount</TableColumn>
              <TableColumn>Sender number</TableColumn>
              <TableColumn>Status</TableColumn>
              <TableColumn>Order reference</TableColumn>
              <TableColumn>Timestamp</TableColumn>
              <TableColumn className="text-end">Action</TableColumn>
            </TableHeader>

            <TableBody>
              {transactions.map((tx) => {
                const meta = MFS_METADATA[tx.provider] || {
                  name: tx.provider,
                  color: 'var(--color-text-secondary)',
                  textClass: 'text-text-primary',
                  borderClass: 'border-border-button-default',
                };

                return (
                  <TableRow key={tx.id} id={tx.id}>
                    {/* Provider & TrxID */}
                    <TableCell>
                      <div className="flex items-center gap-2.5 whitespace-nowrap">
                        <span
                          className={cx(
                            'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-caption-1-medium bg-background-secondary-default shrink-0',
                            meta.borderClass,
                            meta.textClass,
                          )}
                        >
                          <span
                            aria-hidden
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: meta.color }}
                          />
                          <span>{meta.name}</span>
                        </span>
                        <div className="flex items-center gap-1 font-mono text-body-medium text-text-primary">
                          <span className="tabular-nums tnum truncate max-w-[140px]" title={tx.trxId}>
                            {tx.trxId}
                          </span>
                          <Button
                            variant="ghost"
                            size="xs"
                            iconOnly
                            leadingIcon={copiedId === tx.trxId ? RiCheckLine : RiFileCopyLine}
                            aria-label={`Copy TrxID ${tx.trxId}`}
                            onClick={() => handleCopy(tx.trxId)}
                            className={cx(
                              'transition-colors duration-150',
                              copiedId === tx.trxId
                                ? 'text-notification-success-foreground'
                                : 'text-foreground-icon-tertiary',
                            )}
                          />
                        </div>
                      </div>
                    </TableCell>

                    {/* Amount */}
                    <TableCell>
                      <span className="font-mono text-body-medium text-text-primary tabular-nums tnum whitespace-nowrap">
                        {formatBDT(tx.amount)}
                      </span>
                    </TableCell>

                    {/* Sender Number */}
                    <TableCell>
                      <span className="font-mono text-body-regular text-text-secondary tabular-nums tnum whitespace-nowrap">
                        {tx.senderNumber}
                      </span>
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell>
                      {(() => {
                        const trustFlag = tx.trustFlag;
                        const flagMeta = trustFlag ? getTrustFlagMeta(trustFlag) : null;

                        return (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {tx.status === 'VERIFIED' && (
                              <Chip variant="bold" color="lime" className="gap-1.5">
                                <StatusDot color="green" />
                                <span>Verified</span>
                              </Chip>
                            )}
                            {tx.status === 'UNCLAIMED' && (
                              <Chip variant="bold" color="yellow" className="gap-1.5">
                                <StatusDot color="yellow" />
                                <span>Unclaimed</span>
                              </Chip>
                            )}
                            {tx.status === 'MANUAL_VERIFIED' && (
                              <Chip variant="bold" color="cyan">
                                Manual verified
                              </Chip>
                            )}
                            {flagMeta && (
                              <Chip
                                variant="caption"
                                color="rose"
                                title={flagMeta.description}
                                className="gap-1 cursor-help"
                              >
                                <RiErrorWarningLine className="size-3.5 shrink-0" aria-hidden />
                                <span>{flagMeta.label}</span>
                              </Chip>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>

                    {/* Order Reference */}
                    <TableCell>
                      {tx.externalOrderId ? (
                        <Chip
                          variant="caption"
                          color="gray"
                          title={tx.externalOrderId}
                          className="font-mono tabular-nums max-w-[160px] truncate"
                        >
                          {tx.externalOrderId}
                        </Chip>
                      ) : (
                        <span className="text-caption-1-regular text-text-tertiary whitespace-nowrap">
                          Unlinked
                        </span>
                      )}
                    </TableCell>

                    {/* Timestamp */}
                    <TableCell>
                      <span className="whitespace-nowrap text-caption-1-regular text-text-secondary tabular-nums tnum">
                        {formatDate(tx.smsReceivedAt)}
                      </span>
                    </TableCell>

                    {/* Action */}
                    <TableCell className="text-end">
                      <div className="shrink-0 flex items-center justify-end gap-1.5">
                        {tx.status === 'UNCLAIMED' ? (
                          <Button
                            variant="secondary"
                            size="small"
                            leadingIcon={RiToolsLine}
                            onClick={() => setSelectedUnclaimed(tx)}
                          >
                            Rescue typo
                          </Button>
                        ) : (
                          <span className="text-caption-1-medium text-notification-success-foreground whitespace-nowrap">
                            Reconciled
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Unclaimed 1-Click Typo Resolver Modal */}
      {selectedUnclaimed && (
        <UnclaimedModal
          transaction={selectedUnclaimed}
          isOpen={!!selectedUnclaimed}
          onClose={() => setSelectedUnclaimed(null)}
        />
      )}
    </div>
  );
}
