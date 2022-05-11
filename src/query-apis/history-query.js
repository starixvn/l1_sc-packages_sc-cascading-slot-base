export default class HistoryQuery {
    constructor(roundsRepository, totalMultipliersRepository) {
        this.roundsRepository = roundsRepository;
        this.totalMultipliersRepository = totalMultipliersRepository;
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
            paid: false,
            odds: false,
            siteId: false,
            memberId: false,
            __v: false,
            __archive: false,
        };

        const rawBetLogs = await this.roundsRepository
            .find(filter, roundProjection, { sort: { _id: -1 }, skip: numberOfSkippedBets, limit: pageSize })
            .lean()
            .exec();

        const totalMultipliers = (await this.totalMultipliersRepository.find({ uid: player.UID }).lean().exec()) ?? [];

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
