import { stubMongoose } from "jest-micro-auto-stub";
import mongoose from "mongoose";

import { HistoryQuery } from "..";

/** @type {mongoose.Model}*/
const roundsRepository = stubMongoose(mongoose.Model);
const totalMultiplierRepository = stubMongoose(mongoose.Model);

describe("queryHistory", () => {
    let historyQuery;

    beforeEach(() => {
        // Arrange
        historyQuery = new HistoryQuery(roundsRepository, totalMultiplierRepository);
    });

    describe("when page < 1", () => {
        it("should return empty", async () => {
            // Act
            const actualResult = await historyQuery.queryHistory({}, 0, 10);

            // Assert
            expect(actualResult).toBeEmpty();
        });
    });

    describe("when page >= 1", () => {
        describe("when player is null", () => {
            it("should return empty", async () => {
                // Act
                const actualResult = await historyQuery.queryHistory(null, 1, 10);

                // Assert
                expect(actualResult).toBeEmpty();
            });
        });

        describe("when player is not null", () => {
            beforeEach(() => {
                // Arrange
                roundsRepository
                    .find()
                    .lean()
                    .exec.mockReturnValueOnce([
                        { id: 1, freeSpin: false },
                        { id: 2, freeSpin: true },
                    ]);

                roundsRepository.countDocuments.mockReturnValue({ exec: jest.fn() });
                roundsRepository.countDocuments().exec.mockReturnValueOnce(2);
            });

            describe("when total multipliers have data", () => {
                it("should return data", async () => {
                    // Arrange
                    totalMultiplierRepository
                        .find()
                        .lean()
                        .exec.mockReturnValueOnce([{ rounds: [{ roundId: 3 }, { roundId: 2 }] }, { rounds: [{ roundId: 4 }, { roundId: 7 }] }]);

                    const expectValue = {
                        history: {
                            betLogs: [
                                { id: 1, freeSpin: false },
                                { id: 2, freeSpin: true, totalMultipliers: { rounds: [{ roundId: 3 }, { roundId: 2 }] } },
                            ],
                            page: 1,
                            pageSize: 10,
                            total: 2,
                        },
                    };

                    // Act
                    const actualResult = await historyQuery.queryHistory({}, 1, 10);

                    // Assert
                    expect(actualResult).toStrictEqual(expectValue);
                });
            });

            describe("when total multipliers not have data", () => {
                it("should return data", async () => {
                    // Arrange
                    totalMultiplierRepository.find().lean().exec.mockReturnValueOnce(null);

                    const expectValue = {
                        history: {
                            betLogs: [
                                { id: 1, freeSpin: false },
                                { id: 2, freeSpin: true, totalMultipliers: undefined },
                            ],
                            page: 1,
                            pageSize: 10,
                            total: 2,
                        },
                    };

                    // Act
                    const actualResult = await historyQuery.queryHistory({}, 1, 10);

                    // Assert
                    expect(actualResult).toStrictEqual(expectValue);
                });
            });
        });
    });
});
