// pnpm test -- v3/addLiquidityBoosted.integration.test.ts

import { config } from 'dotenv';
config();

import {
    Address,
    createTestClient,
    http,
    parseUnits,
    publicActions,
    TestActions,
    walletActions,
} from 'viem';

import {
    AddLiquidityKind,
    Slippage,
    Hex,
    PoolStateWithUnderlyings,
    CHAINS,
    ChainId,
    AddLiquidityBoostedV3,
    Permit2Helper,
    PERMIT2,
    Token,
    PublicWalletClient,
    AddLiquidityBoostedBuildCallInput,
    AddLiquidityBoostedInput,
} from '../../src';
import {
    setTokenBalances,
    approveSpenderOnTokens,
    approveTokens,
    areBigIntsWithinPercent,
} from '../lib/utils';

import { assertTokenMatch } from 'test/lib/utils';

import { sendTransactionGetBalances } from 'test/lib/utils';

import { ANVIL_NETWORKS, startFork } from '../anvil/anvil-global-setup';

const protocolVersion = 3;

const chainId = ChainId.SEPOLIA;
// deploy 10
const poolid = '0x6dbdd7a36d900083a5b86a55583d90021e9f33e8';
// const stataUSDC = 0x8a88124522dbbf1e56352ba3de1d9f78c143751e;
const USDC = {
    address: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8',
    decimals: 6,
    slot: 0,
};
//const statAUSDT = 0x978206fae13faf5a8d293fb614326b237684b750;
const USDT = {
    address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
    decimals: 6,
    slot: 0,
};

describe('Boosted AddLiquidity', () => {
    let client: PublicWalletClient & TestActions;
    let rpcUrl: string;
    let snapshot: Hex;
    let testAddress: Address;
    const addLiquidityBoosted = new AddLiquidityBoostedV3();

    beforeAll(async () => {
        ({ rpcUrl } = await startFork(ANVIL_NETWORKS[ChainId[chainId]]));

        client = createTestClient({
            mode: 'anvil',
            chain: CHAINS[chainId],
            transport: http(rpcUrl),
        })
            .extend(publicActions)
            .extend(walletActions);

        testAddress = (await client.getAddresses())[0];

        await setTokenBalances(
            client,
            testAddress,
            [USDT.address, USDC.address] as Address[],
            [USDT.slot, USDC.slot] as number[],
            [
                parseUnits('100', USDT.decimals),
                parseUnits('100', USDC.decimals),
            ],
        );

        // approve Permit2 to spend users DAI/USDC
        // does not include the sub approvals
        await approveSpenderOnTokens(
            client,
            testAddress,
            [USDT.address, USDC.address] as Address[],
            PERMIT2[chainId],
        );

        snapshot = await client.snapshot();
    });

    beforeEach(async () => {
        await client.revert({
            id: snapshot,
        });
        snapshot = await client.snapshot();
    });

    describe('permit 2 direct approval', () => {
        beforeEach(async () => {
            // Here We approve the Vault to spend Tokens on the users behalf via Permit2
            await approveTokens(
                client,
                testAddress as Address,
                [USDT.address, USDC.address] as Address[],
                protocolVersion,
            );
        });
        describe('add liquidity unbalanced', () => {
            test('with tokens', async () => {
                const input: AddLiquidityBoostedInput = {
                    chainId,
                    rpcUrl,
                    amountsIn: [
                        {
                            rawAmount: 1000000n,
                            decimals: 6,
                            address: USDC.address as Address,
                        },
                        {
                            rawAmount: 1000000n,
                            decimals: 6,
                            address: USDT.address as Address,
                        },
                    ],
                    kind: AddLiquidityKind.Unbalanced,
                    userData: '0x',
                };

                const addLiquidityQueryOutput = await addLiquidityBoosted.query(
                    input,
                    poolStateWithUnderlyings,
                );

                const addLiquidityBuildInput: AddLiquidityBoostedBuildCallInput =
                    {
                        ...addLiquidityQueryOutput,
                        slippage: Slippage.fromPercentage('1'),
                    };

                const addLiquidityBuildCallOutput =
                    await addLiquidityBoosted.buildCall(addLiquidityBuildInput);

                const { transactionReceipt, balanceDeltas } =
                    await sendTransactionGetBalances(
                        [
                            addLiquidityQueryOutput.bptOut.token.address,
                            USDC.address as `0x${string}`,
                            USDT.address as `0x${string}`,
                        ],
                        client,
                        testAddress,
                        addLiquidityBuildCallOutput.to,
                        addLiquidityBuildCallOutput.callData,
                    );

                expect(transactionReceipt.status).to.eq('success');

                expect(addLiquidityQueryOutput.bptOut.amount > 0n).to.be.true;

                areBigIntsWithinPercent(
                    addLiquidityQueryOutput.bptOut.amount,
                    balanceDeltas[0],
                    0.001,
                );

                const slippageAdjustedQueryOutput = Slippage.fromPercentage(
                    '1',
                ).applyTo(addLiquidityQueryOutput.bptOut.amount, -1);

                expect(
                    slippageAdjustedQueryOutput ===
                        addLiquidityBuildCallOutput.minBptOut.amount,
                ).to.be.true;
            });
            test('with native', async () => {
                // TODO
            });
        });
        describe('add liquidity proportional', () => {
            test('with tokens', async () => {
                const addLiquidityProportionalInput: AddLiquidityBoostedInput =
                    {
                        chainId,
                        rpcUrl,
                        referenceAmount: {
                            rawAmount: 1000000000000000000n,
                            decimals: 18,
                            address: poolid as Address,
                        },
                        kind: AddLiquidityKind.Proportional,
                    };
                const addLiquidityQueryOutput = await addLiquidityBoosted.query(
                    addLiquidityProportionalInput,
                    poolStateWithUnderlyings,
                );
                const addLiquidityBuildInput: AddLiquidityBoostedBuildCallInput =
                    {
                        ...addLiquidityQueryOutput,
                        slippage: Slippage.fromPercentage('1'),
                    };

                const addLiquidityBuildCallOutput =
                    await addLiquidityBoosted.buildCall(addLiquidityBuildInput);

                const { transactionReceipt, balanceDeltas } =
                    await sendTransactionGetBalances(
                        [
                            addLiquidityQueryOutput.bptOut.token.address,
                            USDC.address as `0x${string}`,
                            USDT.address as `0x${string}`,
                        ],
                        client,
                        testAddress,
                        addLiquidityBuildCallOutput.to, //
                        addLiquidityBuildCallOutput.callData,
                    );

                expect(transactionReceipt.status).to.eq('success');

                addLiquidityQueryOutput.amountsIn.map((a) => {
                    expect(a.amount > 0n).to.be.true;
                });

                const expectedDeltas = [
                    addLiquidityProportionalInput.referenceAmount.rawAmount,
                    ...addLiquidityQueryOutput.amountsIn.map(
                        (tokenAmount) => tokenAmount.amount,
                    ),
                ];
                expect(balanceDeltas).to.deep.eq(expectedDeltas);

                const slippageAdjustedQueryInput =
                    addLiquidityQueryOutput.amountsIn.map((amountsIn) => {
                        return Slippage.fromPercentage('1').applyTo(
                            amountsIn.amount,
                            1,
                        );
                    });
                expect(
                    addLiquidityBuildCallOutput.maxAmountsIn.map(
                        (a) => a.amount,
                    ),
                ).to.deep.eq(slippageAdjustedQueryInput);

                // make sure to pass Tokens in correct order. Same as poolTokens but as underlyings instead
                assertTokenMatch(
                    [
                        new Token(
                            111555111,
                            USDC.address as Address,
                            USDC.decimals,
                        ),
                        new Token(
                            111555111,
                            USDT.address as Address,
                            USDT.decimals,
                        ),
                    ],
                    addLiquidityBuildCallOutput.maxAmountsIn.map(
                        (a) => a.token,
                    ),
                );
            });
            test('with native', async () => {
                // TODO
            });
        });
    });

    describe('permit 2 signatures', () => {
        describe('add liquidity unbalanced', () => {
            test('token inputs', async () => {
                const input: AddLiquidityBoostedInput = {
                    chainId,
                    rpcUrl,
                    amountsIn: [
                        {
                            rawAmount: 1000000n,
                            decimals: 6,
                            address: USDC.address as Address,
                        },
                        {
                            rawAmount: 1000000n,
                            decimals: 6,
                            address: USDT.address as Address,
                        },
                    ],
                    kind: AddLiquidityKind.Unbalanced,
                };

                const addLiquidityQueryOutput = await addLiquidityBoosted.query(
                    input,
                    poolStateWithUnderlyings,
                );

                const addLiquidityBuildInput = {
                    ...addLiquidityQueryOutput,
                    slippage: Slippage.fromPercentage('1'),
                } as AddLiquidityBoostedBuildCallInput;

                const permit2 =
                    await Permit2Helper.signAddLiquidityBoostedApproval({
                        ...addLiquidityBuildInput,
                        client,
                        owner: testAddress,
                    });

                const addLiquidityBuildCallOutput =
                    await addLiquidityBoosted.buildCallWithPermit2(
                        addLiquidityBuildInput,
                        permit2,
                    );

                const { transactionReceipt, balanceDeltas } =
                    await sendTransactionGetBalances(
                        [
                            addLiquidityQueryOutput.bptOut.token.address,
                            USDC.address as `0x${string}`,
                            USDT.address as `0x${string}`,
                        ],
                        client,
                        testAddress,
                        addLiquidityBuildCallOutput.to,
                        addLiquidityBuildCallOutput.callData,
                    );

                expect(transactionReceipt.status).to.eq('success');

                expect(addLiquidityQueryOutput.bptOut.amount > 0n).to.be.true;

                areBigIntsWithinPercent(
                    addLiquidityQueryOutput.bptOut.amount,
                    balanceDeltas[0],
                    0.001,
                );

                const slippageAdjustedQueryOutput = Slippage.fromPercentage(
                    '1',
                ).applyTo(addLiquidityQueryOutput.bptOut.amount, -1);

                expect(
                    slippageAdjustedQueryOutput ===
                        addLiquidityBuildCallOutput.minBptOut.amount,
                ).to.be.true;
            });
            test('with native', async () => {
                // TODO
            });
        });
        describe('add liquidity proportional', () => {
            test('token inputs', async () => {
                const addLiquidityProportionalInput: AddLiquidityBoostedInput =
                    {
                        chainId,
                        rpcUrl,
                        referenceAmount: {
                            rawAmount: 1000000000000000000n,
                            decimals: 18,
                            address: poolid as Address,
                        },
                        kind: AddLiquidityKind.Proportional,
                    };

                const addLiquidityQueryOutput = await addLiquidityBoosted.query(
                    addLiquidityProportionalInput,
                    poolStateWithUnderlyings,
                );
                const addLiquidityBuildInput: AddLiquidityBoostedBuildCallInput =
                    {
                        ...addLiquidityQueryOutput,
                        slippage: Slippage.fromPercentage('1'),
                    };

                const permit2 =
                    await Permit2Helper.signAddLiquidityBoostedApproval({
                        ...addLiquidityBuildInput,
                        client,
                        owner: testAddress,
                    });

                const addLiquidityBuildCallOutput =
                    await addLiquidityBoosted.buildCallWithPermit2(
                        addLiquidityBuildInput,
                        permit2,
                    );

                const { transactionReceipt, balanceDeltas } =
                    await sendTransactionGetBalances(
                        [
                            addLiquidityQueryOutput.bptOut.token.address,
                            USDC.address as `0x${string}`,
                            USDT.address as `0x${string}`,
                        ],
                        client,
                        testAddress,
                        addLiquidityBuildCallOutput.to, //
                        addLiquidityBuildCallOutput.callData,
                    );

                expect(transactionReceipt.status).to.eq('success');

                addLiquidityQueryOutput.amountsIn.map((a) => {
                    expect(a.amount > 0n).to.be.true;
                });

                const expectedDeltas = [
                    addLiquidityProportionalInput.referenceAmount.rawAmount,
                    ...addLiquidityQueryOutput.amountsIn.map(
                        (tokenAmount) => tokenAmount.amount,
                    ),
                ];
                expect(balanceDeltas).to.deep.eq(expectedDeltas);

                const slippageAdjustedQueryInput =
                    addLiquidityQueryOutput.amountsIn.map((amountsIn) => {
                        return Slippage.fromPercentage('1').applyTo(
                            amountsIn.amount,
                            1,
                        );
                    });
                expect(
                    addLiquidityBuildCallOutput.maxAmountsIn.map(
                        (a) => a.amount,
                    ),
                ).to.deep.eq(slippageAdjustedQueryInput);

                // make sure to pass Tokens in correct order. Same as poolTokens but as underlyings instead
                assertTokenMatch(
                    [
                        new Token(
                            111555111,
                            USDC.address as Address,
                            USDC.decimals,
                        ),
                        new Token(
                            111555111,
                            USDT.address as Address,
                            USDT.decimals,
                        ),
                    ],
                    addLiquidityBuildCallOutput.maxAmountsIn.map(
                        (a) => a.token,
                    ),
                );
            });
            test('with native', async () => {
                // TODO
            });
        });
    });

    const poolStateWithUnderlyings: PoolStateWithUnderlyings = {
        id: '0x6dbdd7a36d900083a5b86a55583d90021e9f33e8',
        address: '0x6dbdd7a36d900083a5b86a55583d90021e9f33e8',
        type: 'Stable',
        protocolVersion: 3,
        tokens: [
            {
                index: 0,
                address: '0x8a88124522dbbf1e56352ba3de1d9f78c143751e',
                decimals: 6,
                underlyingToken: {
                    address: '0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8',
                    decimals: 6,
                    index: 0,
                },
            },
            {
                index: 1,
                address: '0x978206fae13faf5a8d293fb614326b237684b750',
                decimals: 6,
                underlyingToken: {
                    address: '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0',
                    decimals: 6,
                    index: 1,
                },
            },
        ],
        totalShares: '119755.048508537457614083',
    };
});