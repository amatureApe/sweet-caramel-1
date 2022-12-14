import { BigNumber } from "ethers";
import { NetworthActions, NetworthActionType } from "./actions";

type Status = "loading" | "success" | "error" | "idle";

export interface NetworthState {
  total: {
    [key: string]: { value: BigNumber; status: Status };
  };
  popInWallet: { value: BigNumber; status: Status }[];
}

export const initialState: NetworthState = {
  total: {},
  popInWallet: [],
};

export const networthReducer = (state = initialState, action: NetworthActions = { type: null }) => {
  switch (action.type) {
    case NetworthActionType.UPDATE_NETWORTH: {
      return {
        ...state,
        total: {
          ...state.total,
          [action.payload.key]: {
            value: action.payload.value,
            status: action.payload.status,
          },
        },
      };
    }
    case NetworthActionType.UPDATE_POP_BALANCE: {
      return {
        ...state,
        popInWallet: [...state.popInWallet, action.payload],
      };
    }
    default:
      return state;
  }
};
