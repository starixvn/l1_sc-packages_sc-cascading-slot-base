import { Table } from "sc-game-base";

export default class UserSignInConsumer extends Table.EventConsumers.TableUserSignInConsumer {
    extendPromo(baseData, originalPromotion) {
        return {
            ...baseData,
            betLevel: this.getDefaultBetLevel(),
            coinValue: originalPromotion.coinValue,
        };
    }
    getDefaultBetLevel() {
        const { cascadingSlotsConfig } = this.gameData.gameConfigs;
        return cascadingSlotsConfig.betLevels[0];
    }
}
