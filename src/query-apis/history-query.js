export default class HistoryQuery {
    constructor(roundsRepository, totalMultiplierRepository) {
        this.roundsRepository = roundsRepository;
        this.totalMultiplierRepository = totalMultiplierRepository;
    }

    async queryHistory(player, page, pageSize) {
        if (page < 1 || !player) {
            return {};
        }

        const filter = { uid: player.UID, paid: true };
        const numberOfSkippedBets = (page - 1) * pageSize;
        const total = await this.roundsRepository.countDocuments(filter).exec();
        const roundProjection = {
            _id: false,
            __v: false,
            __archive: false,
            bet: false,
            betMultiplier: false,
            result: false,
            paid: false,
            uid: false,
            name: false,
            rate: false,
            exchangeRateId: false,
            siteId: false,
            playerId: false,
            operatorId: false,
            endTime: false,
            odds: false,
            chainName: false,
            currentBoardIndex: false,
        };

        const rawBetLogs = await this.roundsRepository
            .find(filter, roundProjection, { sort: { id: -1 }, skip: numberOfSkippedBets, limit: pageSize })
            .lean()
            .exec();

        const totalMultipliers = (await this.totalMultiplierRepository.find({ uid: player.UID }).lean().exec()) ?? [];

        const betLogs = rawBetLogs.map((rawBetLog) => {
            const betLog = { ...rawBetLog };
            if (betLog.freeSpin) {
                betLog.totalMultipliers = totalMultipliers.find((t) => t.rounds.some((r) => r.roundId === rawBetLog.id));
            }

            return betLog;
        });

        return { history: { betLogs, page, pageSize, total } };
    }
}
