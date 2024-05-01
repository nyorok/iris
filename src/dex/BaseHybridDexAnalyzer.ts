import { AmmDexOperation, HybridOperation, OrderBookDexOperation, Transaction, Utxo } from '../types';
import { scriptHashToAddress } from '../utils';
import { DexOperationStatus } from '../constants';
import { OperationStatus } from '../db/entities/OperationStatus';
import { LiquidityPoolState } from '../db/entities/LiquidityPoolState';
import { LiquidityPoolSwap } from '../db/entities/LiquidityPoolSwap';
import { LiquidityPoolDeposit } from '../db/entities/LiquidityPoolDeposit';
import { LiquidityPoolZap } from '../db/entities/LiquidityPoolZap';
import { LiquidityPoolWithdraw } from '../db/entities/LiquidityPoolWithdraw';
import { IndexerApplication } from '../IndexerApplication';
import { OrderBookMatch } from '../db/entities/OrderBookMatch';
import { OrderBookOrder } from '../db/entities/OrderBookOrder';

export abstract class BaseHybridDexAnalyzer {

    public app: IndexerApplication;

    public abstract startSlot: number;

    constructor(app: IndexerApplication) {
        this.app = app;
    }

    public abstract analyzeTransaction(transaction: Transaction): Promise<HybridOperation[]>;

    protected liquidityPoolStates?(transaction: Transaction): Promise<LiquidityPoolState[]> | LiquidityPoolState[];

    protected swapOrders?(transaction: Transaction): Promise<LiquidityPoolSwap[]> | LiquidityPoolSwap[];

    protected depositOrders?(transaction: Transaction): Promise<LiquidityPoolDeposit[]> | LiquidityPoolDeposit[];

    protected withdrawOrders?(transaction: Transaction): Promise<LiquidityPoolWithdraw[]> | LiquidityPoolWithdraw[];

    protected orders?(transaction: Transaction): Promise<OrderBookOrder[]> | OrderBookOrder[];

    protected matches?(transaction: Transaction): Promise<(OrderBookMatch | OrderBookOrder)[]> | (OrderBookMatch | OrderBookOrder)[];

    protected zapOrders?(transaction: Transaction): Promise<LiquidityPoolZap[]> | LiquidityPoolZap[];

    /**
     * Retrieve the corresponding spent operations for a transaction.
     */
    protected spentOperationInputs(transaction: Transaction): OperationStatus[] {
        const indexes: number[] = Object.keys(transaction.redeemers).filter((label: string) => {
            return label.startsWith('spend');
        }).map((label: string) => {
            return parseInt(label.split(':')[1]);
        });

        return transaction.inputs.reduce((spentInputs: OperationStatus[], input: Utxo, index: number) => {
            if (indexes.includes(index)) {
                spentInputs.push(
                    OperationStatus.make(
                        DexOperationStatus.Complete,
                        transaction.blockSlot,
                        transaction.hash,
                        index,
                        input.forTxHash,
                        input.index,
                        undefined,
                        undefined,
                    )
                );
            }

            return spentInputs;
        }, []);
    }

    /**
     * Retrieve the possible operations used in a cancel operation.
     */
    protected cancelledOperationInputs(transaction: Transaction, orderAddresses: string[], redeemerDatum: string): OperationStatus[] {
        const containsOrderAddress: boolean = transaction.scriptHashes?.some((scriptHash: string) => {
           return orderAddresses.includes(scriptHashToAddress(scriptHash));
        }) ?? false;

        if (! containsOrderAddress) return [];

        return transaction.inputs.reduce((cancelInputs: OperationStatus[], input: Utxo, index: number) => {
            const redeemerLabel: string = `spend:${index}`;

            if ((redeemerLabel in transaction.redeemers) && transaction.redeemers[redeemerLabel] === redeemerDatum) {
                cancelInputs.push(
                    OperationStatus.make(
                        DexOperationStatus.Cancelled,
                        transaction.blockSlot,
                        transaction.hash,
                        index,
                        input.forTxHash,
                        input.index
                    )
                );
            }

            return cancelInputs;
        }, []);
    }

}