import { FreeSpinsConsumer } from "sc-slot-game-base/src/event-consumers";

export default class FreeSpinConsumer extends FreeSpinsConsumer {
    async gainFreeSpin(player, { roundId, bet, betLevel, coinValue, numberOfFreeSpins }, timeToLive) {
        const createdTime = new Date();
        const expiryTime = new Date(createdTime.getTime()).setSeconds(createdTime.getSeconds() + timeToLive);
        const memberName = player.profile.name;

        await this.idCountersConsumer.consume("freespin");
        this.gameData.freeSpinId++;

        const newlyCachedFreeSpin = {
            id: this.gameData.freeSpinId,
            roundId,
            bet,
            total: numberOfFreeSpins,
            available: numberOfFreeSpins,
            time: createdTime,
            expiryTime,
            betLevel,
            coinValue,
            betMultiplier: this.gameData.gameConfigs.slotsConfig.multiplier,
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
}
