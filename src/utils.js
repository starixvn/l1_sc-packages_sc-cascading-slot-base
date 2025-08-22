/**
 * @param {Object} buyFreeSpinsConfig
 * @param {Object} session
 * @returns {boolean}
 */
export const isBuyFreeSpinEnabled = (buyFreeSpinsConfig, session) => {
    const siteExclusion = buyFreeSpinsConfig.siteExclusions?.find((exclusion) => exclusion.operatorId === session.operatorId);

    return buyFreeSpinsConfig?.enabled && 
        (!siteExclusion || !siteExclusion.sites.some((site) => site.toLowerCase() === session.siteName.toLowerCase()));
};
