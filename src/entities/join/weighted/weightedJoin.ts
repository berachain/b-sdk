import { encodeFunctionData } from 'viem';
import { Token } from '../../../entities/token';
import { TokenAmount } from '../../../entities/tokenAmount';
import { WeightedEncoder } from '../../../entities/encoders/weighted';
import { Address } from '../../../types';
import { BALANCER_VAULT, MAX_UINT256, ZERO_ADDRESS } from '../../../utils';
import { vaultAbi } from '../../../abi';
import {
    BaseJoin,
    JoinBuildOutput,
    AddLiquidityInput,
    AddLiquidityKind,
    AddLiquidityWeightedQueryResult,
    WeightedJoinCall,
} from '../types';
import { AddLiquidityAmounts, PoolState } from '../../types';
import { doQueryJoin, getAmounts, parseJoinArgs } from '../../utils';

export class WeightedJoin implements BaseJoin {
    public async query(
        input: AddLiquidityInput,
        poolState: PoolState,
    ): Promise<AddLiquidityWeightedQueryResult> {
        const amounts = this.getAmountsQuery(poolState.tokens, input);

        const userData = this.encodeUserData(input.kind, amounts);

        const { args, tokensIn } = parseJoinArgs({
            useNativeAssetAsWrappedAmountIn:
                !!input.useNativeAssetAsWrappedAmountIn,
            chainId: input.chainId,
            sortedTokens: poolState.tokens,
            poolId: poolState.id,
            sender: ZERO_ADDRESS,
            recipient: ZERO_ADDRESS,
            maxAmountsIn: amounts.maxAmountsIn,
            userData,
            fromInternalBalance: input.fromInternalBalance ?? false,
        });

        const queryResult = await doQueryJoin(
            input.rpcUrl,
            input.chainId,
            args,
        );

        const bpt = new Token(input.chainId, poolState.address, 18);
        const bptOut = TokenAmount.fromRawAmount(bpt, queryResult.bptOut);

        const amountsIn = queryResult.amountsIn.map((a, i) =>
            TokenAmount.fromRawAmount(tokensIn[i], a),
        );

        return {
            poolType: poolState.type,
            addLiquidityKind: input.kind,
            poolId: poolState.id,
            bptOut,
            amountsIn,
            tokenInIndex: amounts.tokenInIndex,
            fromInternalBalance: !!input.fromInternalBalance,
        };
    }

    public buildCall(input: WeightedJoinCall): JoinBuildOutput {
        const amounts = this.getAmountsCall(input);

        const userData = this.encodeUserData(input.addLiquidityKind, amounts);

        const { args } = parseJoinArgs({
            ...input,
            sortedTokens: input.amountsIn.map((a) => a.token),
            maxAmountsIn: amounts.maxAmountsIn,
            userData,
            fromInternalBalance: input.fromInternalBalance,
        });

        const call = encodeFunctionData({
            abi: vaultAbi,
            functionName: 'joinPool',
            args,
        });

        const value = input.amountsIn.find(
            (a) => a.token.address === ZERO_ADDRESS,
        )?.amount;

        return {
            call,
            to: BALANCER_VAULT,
            value: value === undefined ? 0n : value,
            minBptOut: amounts.minimumBpt,
            maxAmountsIn: amounts.maxAmountsIn,
        };
    }

    private getAmountsQuery(
        poolTokens: Token[],
        input: AddLiquidityInput,
    ): AddLiquidityAmounts {
        switch (input.kind) {
            case AddLiquidityKind.Init:
            case AddLiquidityKind.Unbalanced: {
                return {
                    minimumBpt: 0n,
                    maxAmountsIn: getAmounts(poolTokens, input.amountsIn),
                    tokenInIndex: undefined,
                };
            }
            case AddLiquidityKind.SingleAsset: {
                const tokenInIndex = poolTokens.findIndex((t) =>
                    t.isSameAddress(input.tokenIn),
                );
                if (tokenInIndex === -1)
                    throw Error("Can't find index of SingleAsset");
                const maxAmountsIn = Array(poolTokens.length).fill(0n);
                maxAmountsIn[tokenInIndex] = MAX_UINT256;
                return {
                    minimumBpt: input.bptOut.rawAmount,
                    maxAmountsIn,
                    tokenInIndex,
                };
            }
            case AddLiquidityKind.Proportional: {
                return {
                    minimumBpt: input.bptOut.rawAmount,
                    maxAmountsIn: Array(poolTokens.length).fill(MAX_UINT256),
                    tokenInIndex: undefined,
                };
            }
            default:
                throw Error('Unsupported Join Type');
        }
    }

    private getAmountsCall(input: WeightedJoinCall): AddLiquidityAmounts {
        switch (input.addLiquidityKind) {
            case AddLiquidityKind.Init:
            case AddLiquidityKind.Unbalanced: {
                const minimumBpt = input.slippage.removeFrom(
                    input.bptOut.amount,
                );
                return {
                    minimumBpt,
                    maxAmountsIn: input.amountsIn.map((a) => a.amount),
                    tokenInIndex: input.tokenInIndex,
                };
            }
            case AddLiquidityKind.SingleAsset:
            case AddLiquidityKind.Proportional: {
                return {
                    minimumBpt: input.bptOut.amount,
                    maxAmountsIn: input.amountsIn.map((a) =>
                        input.slippage.applyTo(a.amount),
                    ),
                    tokenInIndex: input.tokenInIndex,
                };
            }
            default:
                throw Error('Unsupported Join Type');
        }
    }

    private encodeUserData(
        kind: AddLiquidityKind,
        amounts: AddLiquidityAmounts,
    ): Address {
        switch (kind) {
            case AddLiquidityKind.Init:
                return WeightedEncoder.joinInit(amounts.maxAmountsIn);
            case AddLiquidityKind.Unbalanced:
                return WeightedEncoder.joinUnbalanced(
                    amounts.maxAmountsIn,
                    amounts.minimumBpt,
                );
            case AddLiquidityKind.SingleAsset: {
                if (amounts.tokenInIndex === undefined) throw Error('No Index');
                return WeightedEncoder.joinSingleAsset(
                    amounts.minimumBpt,
                    amounts.tokenInIndex,
                );
            }
            case AddLiquidityKind.Proportional: {
                return WeightedEncoder.joinProportional(amounts.minimumBpt);
            }
            default:
                throw Error('Unsupported Join Type');
        }
    }
}
