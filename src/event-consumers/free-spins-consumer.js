import Chance from "chance";
import { EventConsumers } from "sc-slot-game-base";
import defaultDefinition from "../board/default-definition";

export default class FreeSpinsConsumer extends EventConsumers.FreeSpinsConsumer {
    constructor(gameId, gameData, freeSpinsRepository, gameNotificationsRepository, idCountersConsumer, roundsRepository) {
        super(gameId, gameData, freeSpinsRepository, gameNotificationsRepository, idCountersConsumer);

        this.roundsRepository = roundsRepository;
        this.chance = new Chance();
        this.buyFreeSpinSymbols = [0, 1, 2, 3, 4, 5, 6, 7, 8].flatMap((symbol) => Array(7).fill(symbol));
    }

    async gainFreeSpin(player, { roundId, totalAmount, betLevel, coinValue, numberOfFreeSpins, buyFreeSpinRefRoundId }, timeToLive) {
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
            buyFreeSpinRefRoundId: buyFreeSpinRefRoundId,
        };

        const gainedFreeSpin = {
            uid: player.UID,
            name: memberName,
            playerId: player.session?.playerId,
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

        if (firstAvailableFreeSpinSet) {
            await this.freeSpinsRepository.updateOne({ id: firstAvailableFreeSpinSet.id }, { $inc: { available: -1 } });
            firstAvailableFreeSpinSet.available--;
        }

        return firstAvailableFreeSpinSet;
    }
    getBuyFreeSpinBoard() {
        const numOfScatterSymbols = 5;

        return [
            {
                newBoard: this.chance.shuffle(
                    this.chance
                        .pickset(
                            this.buyFreeSpinSymbols,
                            defaultDefinition.boardSettings.reels * defaultDefinition.boardSettings.symbolsOnReel - numOfScatterSymbols
                        )
                        .concat(Array.from({ length: numOfScatterSymbols }).fill(defaultDefinition.specialSymbols.freeSpins))
                ),
                multipliers: [],
            },
        ];
    }

    async summarizeBuyFreeSpins(player, buyFreeSpinRefRoundId) {
        const buyFreeSpinRounds = await this.roundsRepository
            .find({
                uid: player.UID,
                $or: [{ buyFreeSpinRefRoundId: buyFreeSpinRefRoundId }, { id: buyFreeSpinRefRoundId }],
            })
            .lean()
            .exec();

        const numberOfFreeSpins = Math.max(0, buyFreeSpinRounds.length - 1);

        const totalWin = buyFreeSpinRounds.reduce((sum, round) => {
            return sum + (round.betwin || 0);
        }, 0);

        return {
            numberOfFreeSpins,
            totalWin,
        };
    }

    async reload() {
        const execTime = new Date();
        console.log(`reload execTime: ${execTime}`);

        const freeSpins = await this.queryFreeSpins();
        console.log(`freeSpins: ${JSON.stringify(freeSpins)}`);
        const activeFreeSpins = freeSpins.filter((freeSpin) => freeSpin.expiryTime > execTime);
        console.log(`activeFreeSpins: ${JSON.stringify(activeFreeSpins)}`);
        const expiredFreeSpins = freeSpins.filter((freeSpin) => freeSpin.expiryTime <= execTime);
        console.log(`expiredFreeSpins: ${JSON.stringify(expiredFreeSpins)}`);

        const freeSpinsGroupedByNames = this.groupFreeSpinsByNames(activeFreeSpins);
        console.log(`freeSpinsGroupedByNames: ${JSON.stringify(freeSpinsGroupedByNames)}`);
        const freeSpinsGroupedByUIDs = this.groupFreeSpinsByUIDs(activeFreeSpins);

        await this.cleanUpGameNotifications(freeSpinsGroupedByUIDs);
        console.log(`this.gameData.ingame before: ${JSON.stringify(this.gameData.ingame)}`);
        Object.entries(this.gameData.ingame).forEach(([name, ingameData]) => {
            const loadedFreeSpins = freeSpinsGroupedByNames[name] ?? [];

            delete ingameData.freeSpins;
            delete freeSpinsGroupedByNames[name];

            ingameData.freeSpins = loadedFreeSpins;
        });
        console.log(`this.gameData.ingame after: ${JSON.stringify(this.gameData.ingame)}`);

        Object.entries(freeSpinsGroupedByNames).forEach(([name, loadedFreeSpins]) => {
            this.gameData.ingame[name] = this.gameData.ingame[name] ?? { betQueue: [] };
            this.gameData.ingame[name].freeSpins = loadedFreeSpins ?? [];
        });

        await this.settleExpiredFreeSpins(expiredFreeSpins);
    }

    async settleExpiredFreeSpins(expiredFreeSpins) {
        const freeSpinsGroupedByNames = this.groupFreeSpinsByNames(expiredFreeSpins);
        console.log(`settleExpiredFreeSpins freeSpinsGroupedByNames: ${JSON.stringify(freeSpinsGroupedByNames)}`);

        await Promise.all(
            Object.entries(freeSpinsGroupedByNames).map(async ([name, loadedFreeSpins]) => {
                console.log(`settleExpiredFreeSpins ingame: ${JSON.stringify(this.gameData.ingame[name])}`);
                const userId = this.gameData.ingame[name]?.player?.UID;
                console.log(`settleExpiredFreeSpins userId: ${userId}`);

                const realPlayer = Object.values(this.gameData.realPlayers).find(
                    (player) => player.UID === userId && player.socketClient && player.socketClient.connected
                );
                console.log(`settleExpiredFreeSpins realPlayers: ${JSON.stringify(Object.values(this.gameData.realPlayers))}`);
                console.log(`settleExpiredFreeSpins realPlayer: ${JSON.stringify(realPlayer)}`);
                const isPlayerInGame = !!realPlayer;

                const round = await this.roundsRepository.findOne({ id: loadedFreeSpins[0].roundId }).lean().exec();
                const player = {
                    UID: round.uid,
                    profile: {
                        name: name,
                    },
                    session: {
                        currencyName: round.currency,
                        operatorId: round.operatorId,
                        siteId: round.siteId,
                        playerId: round.playerId,
                        multiplier: round.multiplier,
                        currencyCode: round.currencyCode,
                        currencyGroupId: round.currencyGroupId,
                    },
                };

                this.gameData.ingame[name] = this.gameData.ingame[name] ?? { betQueue: [] };

                if (player.session.currencyGroupId && player.session.currencyCode) {
                    console.log(`pushing free spins to bet queue ingame: ${JSON.stringify(this.gameData.ingame[name])}`);
                    console.log(`pushing free spins to bet queue loadedFreeSpins: ${JSON.stringify(loadedFreeSpins)}`);
                    this.gameData.ingame[name].freeSpins = (this.gameData.ingame[name].freeSpins ?? []).concat(loadedFreeSpins);
                    console.log(`pushing free spins to bet queue ingame + loadedFreeSpins: ${JSON.stringify(this.gameData.ingame[name])}`);

                    if (!isPlayerInGame) {
                        console.log(`auto settle free spins: ${JSON.stringify(this.gameData.ingame[name])}`);
                        const totalFreeSpins = loadedFreeSpins.reduce((sum, freeSpin) => sum + freeSpin.available, 0);
                        this.gameData.ingame[name].betQueue.push(
                            ...Array.from({ length: totalFreeSpins }).fill({ player, payload: { freeSpin: true } })
                        );
                    }
                }
            })
        );
    }

    queryFreeSpins() {
        const filter = {
            available: { $gt: 0 },
        };
        const projection = {
            _id: false,
            playerId: false,
            __v: false,
            __archive: false,
        };

        return this.freeSpinsRepository
            .find(filter, projection, { sort: { expiryTime: 1 } })
            .lean()
            .exec();
    }

    hasFreeSpin(player) {
        const freeSpinsOfPlayer = this.gameData.ingame[player.profile.name]?.freeSpins;

        if (freeSpinsOfPlayer && freeSpinsOfPlayer.length > 0) {
            return freeSpinsOfPlayer.some((freeSpin) => freeSpin.available > 0);
        }

        return false;
    }

    getSoonestExpiredFreeSpinSet(player) {
        const freeSpinsOfPlayer = this.gameData.ingame[player.profile.name]?.freeSpins ?? [];

        return freeSpinsOfPlayer.find((freeSpin) => freeSpin.available > 0);
    }

    getLatestExpiredFreeSpinSet(player) {
        const freeSpinsOfPlayer = this.gameData.ingame[player.profile.name]?.freeSpins ?? [];

        return freeSpinsOfPlayer.reverse().find((freeSpin) => freeSpin.available > 0);
    }
}
