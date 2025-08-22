/**
 * @param {Object} buyFreeSpinsConfig
 * @param {Object} session
 * @returns {boolean}
 */
export const isBuyFreeSpinEnabled = (buyFreeSpinsConfig, session) => {
    if (!buyFreeSpinsConfig?.enabled) {
        return false;
    }

    if (!buyFreeSpinsConfig.siteExclusions?.length) {
        return true;
    }

    const siteExclusion = buyFreeSpinsConfig.siteExclusions.find((exclusion) => exclusion.operatorId === session.operatorId);

    if (!siteExclusion) {
        return true;
    }

    return !siteExclusion.sites.some((site) => site.toLowerCase() === session.siteName.toLowerCase());
};
