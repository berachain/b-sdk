import { BasePool } from './pool/';
import { Token, TokenAmount } from './';
import { SwapKind } from '../types';

export class Path {
  public readonly pools: BasePool[];
  public readonly tokens: Token[];

  public constructor(tokens: Token[], pools: BasePool[]) {

    this.pools = pools;
    this.tokens = tokens;
  }
}

export class PathWithAmount extends Path {
  public readonly swapAmount: TokenAmount;
  public readonly swapKind: SwapKind;

  public constructor(tokens: Token[], pools: BasePool[], swapAmount: TokenAmount) {
    super(tokens, pools);
    this.swapAmount = swapAmount;

    if (tokens[0] === swapAmount.token) {
      this.swapKind = SwapKind.GivenIn;
    } else {
      this.swapKind = SwapKind.GivenOut;
    }
  }

  public async outputAmount(): Promise<TokenAmount> {
    if (this.swapKind === SwapKind.GivenIn) {
      const amounts: TokenAmount[] = new Array(this.tokens.length);
      amounts[0] = this.swapAmount;
      for (let i = 0; i < this.pools.length; i++) {
        const pool = this.pools[i];
        const outputAmount = await pool.swapGivenIn(
          this.tokens[i],
          this.tokens[i + 1],
          amounts[i]
        );
        amounts[i + 1] = outputAmount;
      }
      const outputAmount = amounts[amounts.length - 1];
      return outputAmount;
    } else {
      return this.swapAmount;
    }
  }
}