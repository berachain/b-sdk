export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export enum PoolType {
    Weighted = 'Weighted',
    ComposableStable = 'ComposableStable',
    MetaStable = 'MetaStable',
    AaveLinear = 'AaveLinear',
    Fx = 'FX',
    Gyro2 = 'Gyro2',
    Gyro3 = 'Gyro3',
    GyroE = 'GyroE',
}

export enum SwapKind {
    GivenIn = 0,
    GivenOut = 1,
}

export interface SingleSwap {
    poolId: Hex;
    kind: SwapKind;
    assetIn: Address;
    assetOut: Address;
    amount: bigint;
    userData: Hex;
}

export interface BatchSwapStep {
    poolId: Hex;
    assetInIndex: bigint;
    assetOutIndex: bigint;
    amount: bigint;
    userData: Hex;
}

export type InputToken = {
    address: Address;
    decimals: number;
};

export type InputAmount = InputToken & {
    rawAmount: bigint;
};

export type InputAmountInit = InputAmount | InputAmountInitWeighted;

export type InputAmountInitWeighted = InputAmount & {
    weight: bigint;
};
