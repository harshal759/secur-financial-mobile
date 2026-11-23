import { buildDataLayerUpdatesFromData } from '../../scripts/form-data-layer.js';

/**
 * Get Full Name
 * @name getFullName Concats first name and last name
 * @param {string} firstname in Stringformat
 * @param {string} lastname in Stringformat
 * @return {string}
 */
function getFullName(firstname, lastname) {
  return `${firstname} ${lastname}`.trim();
}

/**
 * Custom submit function
 * @param {scope} globals
 */
function submitFormArrayToString(globals) {
  const data = globals.functions.exportData();
  Object.keys(data).forEach((key) => {
    if (Array.isArray(data[key])) {
      data[key] = data[key].join(',');
    }
  });
  globals.functions.submitForm(data, true, 'application/json');
}

/**
 * Calculate the number of days between two dates.
 * @param {*} endDate
 * @param {*} startDate
 * @returns {number} returns the number of days between two dates
 */
function days(endDate, startDate) {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

  // return zero if dates are valid
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const diffInMs = Math.abs(end.getTime() - start.getTime());
  return Math.floor(diffInMs / (1000 * 60 * 60 * 24));
}

/**
 * Push the current form values to the data layer
 * @name pushFormToDataLayer Pushes the form values to the data layer without submitting
 * @param {scope} globals
 * @return {boolean} true when the data layer was updated
 */
function pushFormToDataLayer(globals) {
  const updates = buildDataLayerUpdatesFromData(globals.functions.exportData());
  if (!updates || typeof window === 'undefined' || typeof window.updateDataLayer !== 'function') {
    return false;
  }
  window.updateDataLayer(updates);
  return true;
}

// eslint-disable-next-line import/prefer-default-export
export {
  getFullName, days, submitFormArrayToString, pushFormToDataLayer,
};
