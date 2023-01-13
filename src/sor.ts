import { BigNumber } from '@ethersproject/bignumber';
import { BaseProvider } from '@ethersproject/providers';
import { PoolDataService } from './poolProvider';
import { Router } from './router';
import { Swap, Token, TokenAmount, Path } from './entities';
import { ChainId } from './utils';
import { SwapKind, SorConfig } from './types';

export interface FundManagement {
  sender: string;
  fromInternalBalance: boolean;
  recipient: boolean;
  toInternalBalance: boolean;
}

export interface SwapOptions {
  slippage: BigNumber;
  funds: FundManagement;
  deadline: BigNumber;
}

export interface PathWithAmount {
  path: Path;
  inputAmount: TokenAmount;
  outputAmount: TokenAmount;
}

export interface SwapInfo {
  quote: TokenAmount;
  swap: Swap;
  paths: PathWithAmount[];
  // gasPriceWei: BigNumber;
  // estimateTxGas: BigNumber;
  // transactionData: TransactionData;
}

export type TransactionData = {
  calldata: string;
  value: BigNumber;
};

export class SmartOrderRouter {
  public chainId: ChainId;
  // public provider: BaseProvider;
  private readonly poolProvider: PoolDataService;
  public readonly router: Router;

  constructor({
    chainId,
    // provider,
    poolProvider,
    options,
  }: SorConfig) {
    this.chainId = chainId;
    // this.provider = provider;
    this.poolProvider = poolProvider;
    this.router = new Router();
  }

  async getSwaps(
    tokenIn: Token,
    tokenOut: Token,
    swapKind: SwapKind,
    swapAmount: TokenAmount,
    swapOptions?: SwapOptions
  ): Promise<SwapInfo> {

    console.time('poolProvider');
    const pools = await this.poolProvider.getPools();
    console.timeEnd('poolProvider');

    console.time('getCandidatePaths');
    const candidatePaths = this.router.getCandidatePaths(
      tokenIn,
      tokenOut,
      swapKind,
      pools
    );
    console.timeEnd('getCandidatePaths');

    console.time('bestPaths');
    const bestPaths = await this.router.getBestPaths(candidatePaths, swapKind, swapAmount);
    console.timeEnd('bestPaths');

    const swapInfo = {
      quote: swapAmount,
      swap: bestPaths,
      paths: bestPaths.paths,
    };

    return swapInfo;
  }
}