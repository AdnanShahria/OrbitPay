import { useState } from 'react';
import {
  useOrders,
  useOrderActionMutation,
  type MerchantOrder,
  type OrderAction,
  type OrderPaymentMethod,
  type OrderStatus,
} from './useOrders';
import { useMerchantProjects } from '@/features/projects/useProjects';
import { Card, CardContent } from '@/components/base/card/card';
import { Button } from '@/components/base/buttons/button';
import { SearchField } from '@/components/base/search-field/search-field';
import { Select, SelectItem } from '@/components/base/select/select';
import { PillTabList, PillTab } from '@/components/base/tabs/pill-tab';
import { Chip, type ChipColor } from '@/components/base/badges/chip';
import { StatusDot } from '@/components/base/badges/status-dot';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/base/table/table';
import { toast } from '@/components/base/toast/toast';
import { formatBDT, formatDate } from '@/shared/utils/format';
import {
  RiCheckDoubleLine,
  RiTruckLine,
  RiBox3Line,
  RiMoneyDollarCircleLine,
  RiCloseCircleLine,
  RiFilter3Line,
  RiShoppingBag3Line,
  RiRefreshLine,
} from '@remixicon/react';

const STATUS_FILTERS: Array<{ label: string; value: OrderStatus | 'ALL' }> = [
  { label: 'All orders', value: 'ALL' },
  { label: 'New', value: 'NEW' },
  { label: 'Awaiting confirm', value: 'AWAITING_CONFIRMATION' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Ready to ship', value: 'READY_TO_SHIP' },
  { label: 'Shipped', value: 'SHIPPED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

const PAYMENT_METHOD_FILTERS: Array<{ label: string; value: OrderPaymentMethod | 'ALL' }> = [
  { label: 'All methods', value: 'ALL' },
  { label: 'ORBIT MFS', value: 'ORBIT_MFS' },
  { label: 'Cash on Delivery', value: 'COD' },
  { label: 'Card', value: 'CARD' },
  { label: 'Other', value: 'OTHER' },
];

function getOrderStatusChip(status: OrderStatus): { label: string; color: ChipColor } {
  switch (status) {
    case 'NEW':
      return { label: 'New', color: 'blue' };
    case 'AWAITING_CONFIRMATION':
      return { label: 'Awaiting confirmation', color: 'yellow' };
    case 'CONFIRMED':
      return { label: 'Confirmed', color: 'cyan' };
    case 'READY_TO_SHIP':
      return { label: 'Ready to ship', color: 'purple' };
    case 'SHIPPED':
      return { label: 'Shipped', color: 'lime' };
    case 'CANCELLED':
      return { label: 'Cancelled', color: 'rose' };
    default:
      return { label: status, color: 'neutral' };
  }
}

function getPaymentStatusChip(status: MerchantOrder['paymentStatus']): { label: string; color: ChipColor } {
  switch (status) {
    case 'PAID':
      return { label: 'Paid', color: 'lime' };
    case 'PENDING_VERIFICATION':
      return { label: 'Verifying', color: 'yellow' };
    case 'COD_COLLECTIBLE':
      return { label: 'COD collectible', color: 'orange' };
    case 'UNPAID':
      return { label: 'Unpaid', color: 'neutral' };
    case 'FAILED':
      return { label: 'Failed', color: 'rose' };
    default:
      return { label: status, color: 'neutral' };
  }
}

function getPaymentMethodChip(method: OrderPaymentMethod): { label: string; color: ChipColor } {
  switch (method) {
    case 'ORBIT_MFS':
      return { label: 'ORBIT MFS', color: 'lime' };
    case 'COD':
      return { label: 'COD', color: 'yellow' };
    case 'CARD':
      return { label: 'Card', color: 'blue' };
    case 'BANK_TRANSFER':
      return { label: 'Bank', color: 'cyan' };
    default:
      return { label: 'Other', color: 'neutral' };
  }
}

export function OrdersManager() {
  const { data: subProjects = [] } = useMerchantProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'ALL'>('ALL');
  const [selectedMethod, setSelectedMethod] = useState<OrderPaymentMethod | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useOrders({
    projectId: selectedProjectId,
    orderStatus: selectedStatus,
    paymentMethod: selectedMethod,
    search: searchQuery,
  });

  const actionMutation = useOrderActionMutation();

  const orders = data?.items ?? [];
  const pendingCount = data?.pendingConfirmationCount ?? 0;

  const handleAction = async (order: MerchantOrder, action: OrderAction, label: string) => {
    if (actionMutation.isPending) return;
    const key = `${order.externalOrderId}:${action}`;
    setActiveActionKey(key);
    try {
      const result = await actionMutation.mutateAsync({
        externalOrderId: order.externalOrderId,
        action,
      });

      toast.success(`${order.externalOrderId}: ${label}`, {
        description: result.webhookDispatched
          ? 'Storefront webhook dispatched with HMAC signature.'
          : 'Order status updated in ORBIT Hub.',
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : `Failed to ${label.toLowerCase()}`);
    } finally {
      setActiveActionKey(null);
    }
  };

  return (
    <div className="flex w-full flex-col gap-5">
      {/* Header Summary Banner */}
      <Card>
        <CardContent className="flex flex-col justify-between gap-4 pt-5 sm:flex-row sm:items-center sm:pt-6">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
              <RiShoppingBag3Line className="size-5" aria-hidden />
            </div>
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-title-2-medium text-text-primary">
                  Orders &amp; COD Sync
                </h2>
                {pendingCount > 0 && (
                  <Chip variant="bold" color="yellow" className="gap-1.5">
                    <StatusDot color="yellow" />
                    <span>{pendingCount} awaiting confirmation</span>
                  </Chip>
                )}
              </div>
              <p className="text-body-regular text-text-secondary">
                Confirm Cash-on-Delivery, Card, and ORBIT MFS orders with signed storefront sync.
              </p>
            </div>
          </div>

          <Button
            variant="secondary"
            size="small"
            onClick={() => refetch()}
            isLoading={isFetching}
            leadingIcon={RiRefreshLine}
            className="min-h-11 sm:min-h-10 shrink-0"
          >
            Refresh Orders
          </Button>
        </CardContent>
      </Card>

      {/* Filters + Orders Table */}
      <Card>
        <div className="flex flex-col justify-between gap-3 border-b border-separator-border p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <SearchField
              aria-label="Search orders"
              placeholder="Search order ID, customer name, phone, or TrxID..."
              value={searchQuery}
              onChange={setSearchQuery}
              shape="pill"
              className="w-full lg:w-80"
            />

            <div className="flex flex-wrap items-center gap-2">
              <RiFilter3Line className="size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
              {subProjects.length > 0 && (
                <Select
                  aria-label="Filter orders by project"
                  size="md"
                  selectedKey={selectedProjectId}
                  onSelectionChange={(key) => {
                    if (key != null) setSelectedProjectId(String(key));
                  }}
                  className="min-w-[168px]"
                >
                  <SelectItem id="ALL" textValue="All projects">
                    All projects
                  </SelectItem>
                  {subProjects.map((sp) => (
                    <SelectItem key={sp.id} id={sp.id} textValue={sp.name}>
                      {sp.name}
                    </SelectItem>
                  ))}
                </Select>
              )}
              <Select
                aria-label="Filter by payment method"
                size="md"
                selectedKey={selectedMethod}
                onSelectionChange={(key) => {
                  if (key != null) setSelectedMethod(String(key) as OrderPaymentMethod | 'ALL');
                }}
                className="min-w-[168px]"
              >
                {PAYMENT_METHOD_FILTERS.map((m) => (
                  <SelectItem key={m.value} id={m.value} textValue={m.label}>
                    {m.label}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </div>

          <PillTabList
            aria-label="Filter orders by status"
            className="flex-wrap"
          >
            {STATUS_FILTERS.map((f) => (
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
        </div>

        {isLoading ? (
          <div aria-busy="true" aria-label="Loading orders" className="space-y-3 p-5">
            {Array.from({ length: 5 }, (_, idx) => (
              <Skeleton key={idx} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="px-5 py-14 text-center space-y-1.5">
            <RiShoppingBag3Line className="size-8 mx-auto text-foreground-icon-tertiary" aria-hidden />
            <p className="text-body-medium text-text-primary">No orders found</p>
            <p className="text-caption-1-regular text-text-secondary max-w-md mx-auto">
              Push COD, Card, or ORBIT MFS orders from your storefront using{' '}
              <code className="font-mono text-text-primary">POST /api/v1/orders/notify</code> or adjust your filters.
            </p>
          </div>
        ) : (
          <Table aria-label="Merchant orders queue">
            <TableHeader>
              <TableColumn isRowHeader>Order &amp; Customer</TableColumn>
              <TableColumn>Items</TableColumn>
              <TableColumn>Method &amp; Payment</TableColumn>
              <TableColumn>Amounts</TableColumn>
              <TableColumn>Order status</TableColumn>
              <TableColumn className="text-end">Sync actions</TableColumn>
            </TableHeader>

            <TableBody>
              {orders.map((order) => {
                const orderBadge = getOrderStatusChip(order.orderStatus);
                const payBadge = getPaymentStatusChip(order.paymentStatus);
                const methodBadge = getPaymentMethodChip(order.paymentMethod);
                const isCancelled = order.orderStatus === 'CANCELLED';
                const isShipped = order.orderStatus === 'SHIPPED';

                return (
                  <TableRow key={order.id} id={order.id}>
                    {/* Order & Customer */}
                    <TableCell>
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            title={order.externalOrderId}
                            className="font-mono text-body-medium text-text-primary truncate max-w-[160px]"
                          >
                            {order.externalOrderId}
                          </span>
                          {order.projectName && (
                            <Chip variant="caption" color="purple">
                              {order.projectName}
                            </Chip>
                          )}
                          <span className="text-caption-2-regular text-text-tertiary whitespace-nowrap tabular-nums tnum">
                            {formatDate(order.createdAt)}
                          </span>
                        </div>
                        <div className="text-caption-1-medium text-text-primary truncate max-w-[220px]">
                          {order.customerName || 'Guest Customer'}
                        </div>
                        <div className="text-caption-2-regular text-text-secondary font-mono tabular-nums whitespace-nowrap">
                          {order.customerPhone || order.customerEmail || 'No contact'}
                        </div>
                      </div>
                    </TableCell>

                    {/* Items */}
                    <TableCell>
                      <div className="max-w-xs space-y-0.5">
                        <p className="text-caption-1-regular text-text-primary line-clamp-2">
                          {order.itemsSummary || 'Standard storefront order'}
                        </p>
                        {order.shippingAddress && (
                          <p
                            title={order.shippingAddress}
                            className="text-caption-2-regular text-text-tertiary truncate"
                          >
                            {order.shippingAddress}
                          </p>
                        )}
                      </div>
                    </TableCell>

                    {/* Method & Payment */}
                    <TableCell>
                      <div className="flex flex-col items-start gap-1.5">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <Chip variant="caption" color={methodBadge.color}>
                            {methodBadge.label}
                          </Chip>
                          <Chip variant="caption" color={payBadge.color}>
                            {payBadge.label}
                          </Chip>
                        </div>
                        {order.trxId && (
                          <span
                            title={order.trxId}
                            className="font-mono text-caption-2-medium text-text-secondary truncate max-w-[160px]"
                          >
                            TrxID: {order.trxId}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Amounts */}
                    <TableCell>
                      <div className="font-mono tabular-nums tnum whitespace-nowrap">
                        <div className="text-body-medium text-text-primary">
                          {formatBDT(order.paidAmount ?? order.uniqueAmount ?? order.baseAmount)}
                        </div>
                      </div>
                    </TableCell>

                    {/* Order Status */}
                    <TableCell>
                      <Chip variant="bold" color={orderBadge.color}>
                        {orderBadge.label}
                      </Chip>
                    </TableCell>

                    {/* 1-Click Bi-Directional Actions */}
                    <TableCell className="text-end">
                      <div className="shrink-0 flex items-center justify-end gap-1.5">
                        {(order.orderStatus === 'NEW' ||
                          order.orderStatus === 'AWAITING_CONFIRMATION') && (
                          <Button
                            variant="primary"
                            size="xs"
                            leadingIcon={RiCheckDoubleLine}
                            isLoading={activeActionKey === `${order.externalOrderId}:CONFIRM`}
                            onClick={() => handleAction(order, 'CONFIRM', 'Confirmed')}
                          >
                            Confirm Order
                          </Button>
                        )}

                        {order.orderStatus === 'CONFIRMED' && (
                          <Button
                            variant="secondary"
                            size="xs"
                            leadingIcon={RiBox3Line}
                            isLoading={activeActionKey === `${order.externalOrderId}:READY_TO_SHIP`}
                            onClick={() => handleAction(order, 'READY_TO_SHIP', 'Ready to Ship')}
                          >
                            Ready to Ship
                          </Button>
                        )}

                        {(order.orderStatus === 'CONFIRMED' ||
                          order.orderStatus === 'READY_TO_SHIP') && (
                          <Button
                            variant="primary"
                            size="xs"
                            leadingIcon={RiTruckLine}
                            isLoading={activeActionKey === `${order.externalOrderId}:SHIP`}
                            onClick={() => handleAction(order, 'SHIP', 'Marked Shipped')}
                          >
                            Mark Shipped
                          </Button>
                        )}

                        {!isCancelled && order.paymentStatus !== 'PAID' && (
                          <Button
                            variant="secondary"
                            size="xs"
                            leadingIcon={RiMoneyDollarCircleLine}
                            isLoading={activeActionKey === `${order.externalOrderId}:MARK_PAID`}
                            onClick={() => handleAction(order, 'MARK_PAID', 'Marked Paid')}
                          >
                            Mark Paid
                          </Button>
                        )}

                        {!isCancelled && !isShipped && (
                          <Button
                            variant="ghost"
                            size="xs"
                            leadingIcon={RiCloseCircleLine}
                            isLoading={activeActionKey === `${order.externalOrderId}:CANCEL`}
                            onClick={() => handleAction(order, 'CANCEL', 'Cancelled')}
                            className="text-text-destructive"
                          >
                            Cancel
                          </Button>
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
    </div>
  );
}
