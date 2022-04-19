import { helpers } from "sc-common";
import { Core } from "sc-game-base";

export default class PlaceBetConsumer extends Core.BaseEventConsumers.PlaceBetConsumer {
    consume(player, payload) {
        Object.assign(payload, {
            roundId: payload.roundId ?? this.gameData.roundId,
            betLevel: payload.betLevel,
            coinValue: payload.coinValue,
            freeSpin: payload.freeSpin ?? false,
        });

        const name = player.profile.name;
        if (!this.validateBetRequest(player, payload)) {
            return;
        }

        if (!this.gameData.ingame[name]) {
            const newPlayer = {
                name: player.profile.name,
                currency: player.session.currencyName,
                betTracks: {},
                betQueue: [],
                partnerId: player.session.partnerId,
                operatorId: player.session.partnerId,
            };

            this.gameData.ingame[name] = newPlayer;
        }

        this.gameData.ingame[name].betQueue.push({ player, payload });
    }

    validateBetRequest(player, payload) {
        const isValid = payload.betLevel && payload.coinValue;
        if (!isValid) {
            return false;
        }

        const criteria = this.composeValidationCriteria(player, payload);
        const failedCriterion = criteria.find((criterion) => criterion.failure);

        if (failedCriterion) {
            this.publisher.publishToUser(player.UID, { endBet: -1, notice: failedCriterion.notice });

            return false;
        }

        return true;
    }

    composeValidationCriteria(player, payload) {
        const bettingTimeValidationCriteria = this.composeBettingTimeValidationCriteria();
        const betAmountValidationCriteria = this.composeBetAmountValidationCriteria(player, payload);
        return bettingTimeValidationCriteria.concat(betAmountValidationCriteria);
    }

    composeBettingTimeValidationCriteria() {
        const configs = this.gameData.gameConfigs;

        return [
            {
                failure: !configs.enabled,
                notice: this.getNoticeObj(helpers.noticeHelper.invalidBet),
            },
        ];
    }

    composeBetAmountValidationCriteria(player, payload) {
        const settings = this.gameData.currencyGroupGames.find((x) => x.groupId.toString() === player.session.currencyGroupId) ?? {
            betLevels: [],
            coinValues: [],
        };
        const configs = this.gameData.gameConfigs;
        const { betLevel, coinValue } = payload;

        return [
            {
                failure: payload.freeBet && !configs.enableFreeBet,
                notice: this.getNoticeObj(helpers.noticeHelper.invalidBet),
            },
            {
                failure: settings.betLevels.indexOf(betLevel) === -1,
                notice: this.getNoticeObj(helpers.noticeHelper.invalidBet),
            },
            {
                failure: settings.coinValues.indexOf(coinValue) === -1,
                notice: this.getNoticeObj(helpers.noticeHelper.invalidBet),
            },
        ];
    }

    adjustBetTracks() {}
}
