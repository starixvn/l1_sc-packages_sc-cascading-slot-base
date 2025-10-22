import Chance from "chance";
import { EventConsumers } from "sc-slot-game-base";
import defaultDefinition from "../board/default-definition";

export default class FreeSpinsConsumer extends EventConsumers.FreeSpinsConsumer {
    constructor(gameId, gameData, freeSpinsRepository, idCountersConsumer, gameManagementApiClientFactory, roundsRepository, userSessionsRepository) {
        super(gameId, gameData, freeSpinsRepository, idCountersConsumer, gameManagementApiClientFactory);

        this.roundsRepository = roundsRepository;
        this.userSessionsRepository = userSessionsRepository;
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
            betLevel,
            coinValue,
            betMultiplier: this.gameData.gameConfigs.cascadingSlotsConfig.betMultiplier,
            buyFreeSpinRefRoundId: buyFreeSpinRefRoundId,
            expiryTime: player.usePromotion ? player.promotion.endDate : expiryTime,
            ...(player.usePromotion && { promotionId: player.promotion.promotionId }),
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
            this.updatePlayerPromotionFreeSpins(player, newlyCreatedFreeSpin);
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
        const numOfScatterSymbols = 4;

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

        const freeSpins = await this.queryFreeSpins();
        const activeFreeSpins = freeSpins.filter((freeSpin) => freeSpin.expiryTime > execTime);

        const freeSpinsGroupedByNames = this.groupFreeSpinsByNames(activeFreeSpins);
        const freeSpinsGroupedByUIDs = this.groupFreeSpinsByUIDs(activeFreeSpins);

        await this.cleanUpGameNotifications(freeSpinsGroupedByUIDs);
        Object.entries(this.gameData.ingame).forEach(([name, ingameData]) => {
            const loadedFreeSpins = freeSpinsGroupedByNames[name] ?? [];

            delete ingameData.freeSpins;
            delete freeSpinsGroupedByNames[name];

            ingameData.freeSpins = loadedFreeSpins;
        });

        Object.entries(freeSpinsGroupedByNames).forEach(([name, loadedFreeSpins]) => {
            this.gameData.ingame[name] = this.gameData.ingame[name] ?? { betQueue: [] };
            this.gameData.ingame[name].freeSpins = loadedFreeSpins ?? [];
        });

        const expiredFreeSpins = freeSpins.filter((freeSpin) => freeSpin.expiryTime <= execTime);

        const freeSpinsNeedToSettle = expiredFreeSpins.filter((freeSpin) => !this.isPlayerInGame(freeSpin.name) && !freeSpin.autoSettle);
        const freeSpinsNeedToCache = expiredFreeSpins.filter((freeSpin) => this.isPlayerInGame(freeSpin.name));

        freeSpinsNeedToSettle.length > 0 && (await this.settleExpiredFreeSpins(freeSpinsNeedToSettle));
        freeSpinsNeedToCache.length > 0 && this.cacheExpiredFreeSpins(freeSpinsNeedToCache);
    }

    isPlayerInGame(name) {
        return Object.values(this.gameData.realPlayers).some(
            (player) => player.profile.name === name && player.socketClient && player.socketClient.connected
        );
    }

    cacheExpiredFreeSpins(expiredFreeSpins) {
        const freeSpinsGroupedByNames = this.groupFreeSpinsByNames(expiredFreeSpins);

        Object.entries(freeSpinsGroupedByNames).map(([name, loadedFreeSpins]) => {
            this.initPlayerFreeSpins(name, loadedFreeSpins);
        });
    }

    initPlayerFreeSpins(name, loadedFreeSpins) {
        this.gameData.ingame[name] = this.gameData.ingame[name] ?? { betQueue: [] };
        this.gameData.ingame[name].freeSpins = (this.gameData.ingame[name].freeSpins ?? []).concat(loadedFreeSpins);
    }

    async settleExpiredFreeSpins(expiredFreeSpins) {
        //temporary solution to set autoSettle to true
        await this.freeSpinsRepository.updateMany({ id: { $in: expiredFreeSpins.map((freeSpin) => freeSpin.id) } }, { $set: { autoSettle: true } });
        const freeSpinsGroupedByNames = this.groupFreeSpinsByNames(expiredFreeSpins);

        await Promise.all(
            Object.entries(freeSpinsGroupedByNames).map(async ([name, loadedFreeSpins]) => {
                const round = await this.roundsRepository.findOne({ id: loadedFreeSpins[0].roundId }).lean().exec();
                const userSession = await this.userSessionsRepository
                    .findOne({ playerId: round.playerId }, "ip operatorToken")
                    .sort({ _id: -1 })
                    .lean()
                    .exec();
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
                        ip: userSession.ip,
                        operatorToken: userSession.operatorToken,
                    },
                };

                if (player.session.currencyGroupId && player.session.currencyCode) {
                    this.initPlayerFreeSpins(name, loadedFreeSpins);

                    const totalFreeSpins = loadedFreeSpins.reduce((sum, freeSpin) => sum + freeSpin.available, 0);

                    this.gameData.ingame[name].betQueue.push(
                        ...Array.from({ length: totalFreeSpins }).fill({ player, payload: { freeSpin: true, autoSettle: true } })
                    );
                }
            })
        );
    }

    queryFreeSpins() {
        //temporary solution to filter out autoSettle free spins
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
