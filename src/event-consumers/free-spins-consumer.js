import { EventConsumers } from "sc-slot-game-base";

export default class FreeSpinsConsumer extends EventConsumers.FreeSpinsConsumer {
    constructor(gameId, gameData, freeSpinsRepository, gameNotificationsRepository, idCountersConsumer, totalMultiplierConsumer) {
        super(gameId, gameData, freeSpinsRepository, gameNotificationsRepository, idCountersConsumer);

        this.totalMultiplierConsumer = totalMultiplierConsumer;
    }

    async gainFreeSpin(player, { roundId, totalAmount, betLevel, coinValue, numberOfFreeSpins }, timeToLive) {
        const createdTime = new Date();
        const expiryTime = new Date(createdTime.getTime()).setSeconds(createdTime.getSeconds() + timeToLive);
        const memberName = player.profile.name;

        await this.idCountersConsumer.consume("freespin");
        this.gameData.freeSpinId++;

        const newlyCachedFreeSpin = {
            id: this.gameData.freeSpinId,
            roundId,
            bet: totalAmount,
            total: numberOfFreeSpins,
            available: numberOfFreeSpins,
            time: createdTime,
            expiryTime,
            betLevel,
            coinValue,
            betMultiplier: this.gameData.gameConfigs.cascadingSlotsConfig.betMultiplier,
        };

        const gainedFreeSpin = {
            uid: player.UID,
            memberId: player.session?.memberId,
            name: memberName,
            playerId: player.session?.memberId,
            ...newlyCachedFreeSpin,
        };

        const newlyCreatedFreeSpin = await this.freeSpinsRepository.create(gainedFreeSpin);

        if (newlyCreatedFreeSpin) {
            newlyCachedFreeSpin.id = newlyCreatedFreeSpin.id;
            this.gameData.ingame[memberName].freeSpins = this.gameData.ingame[memberName].freeSpins ?? [];

            this.gameData.ingame[memberName].freeSpins.push(newlyCachedFreeSpin);
        }
    }

    async useFreeSpin(player) {
        const firstAvailableFreeSpinSet = this.getSoonestExpiredFreeSpinSet(player);
        const totalAvailableFreeSpins = this.getTotalAvaiableFreeSpins(player);

        if (firstAvailableFreeSpinSet) {
            await this.freeSpinsRepository.updateOne({ id: firstAvailableFreeSpinSet.id }, { $inc: { available: -1 } });

            firstAvailableFreeSpinSet.available--;
        }

        if (!totalAvailableFreeSpins) {
            await this.totalMultiplierConsumer.stopChain(player);
        }
    }
}
