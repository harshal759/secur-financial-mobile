import { buildDataLayerUpdatesFromData } from '../../scripts/form-data-layer.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';

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

/**
 * Set the Launch identity from an email address
 * @name setLaunchIdentity Stores the email so Launch and Web SDK can identify the user
 * @param {string} email
 * @return {boolean} true when the identity was stored
 */
function setLaunchIdentity(email) {
  const id = String(email || '').trim();
  if (!id || typeof window === 'undefined') return false;
  const identity = JSON.stringify({ Email: [{ id, primary: true, authenticatedState: 'authenticated' }] });
  try {
    localStorage.setItem('com.adobe.reactor.dataElements.Identities', identity);
    sessionStorage.setItem('com.adobe.reactor.dataElements.Identity Map', identity);
    localStorage.setItem('com.adobe.reactor.dataElements.Profile - Email', id);
    // eslint-disable-next-line no-underscore-dangle
    const satellite = window._satellite;
    if (satellite && typeof satellite.setVar === 'function') {
      satellite.setVar('Profile - Email', id);
    }
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Fire a Launch custom event
 * @name fireLaunchEvent Fires the Launch event with a copy of the current data layer
 * @param {string} eventName Launch event name, for example create-account-submit
 * @return {boolean} true when the event was fired, false when it was queued until Launch is ready
 */
function fireLaunchEvent(eventName) {
  return dispatchCustomEvent(eventName);
}

/**
 * Set the mobile event type
 * @name setMobileEventType Sets the event type the mobile app sends for this form
 * @param {string} eventType Mobile event type, for example mobile.registration
 * @return {string} the event type
 */
function setMobileEventType(eventType) {
  // Does nothing in the browser. The rule only stores the value for the mobile app export to read.
  return String(eventType || '').trim();
}

/**
 * Track a wizard form
 * @name trackWizard Tracks a wizard form: start, each step, and abandonment
 * @param {string} startEvent Launch event fired when the wizard starts, for example form-start
 * @param {string} stepEvent Launch event fired on each step forward, for example form-step
 * @param {string} abandonedEvent Launch event fired when the user leaves before submitting
 * @param {string} wizardName Name sent in the wizard data layer object
 * @param {string} wizardTitle Title sent in the wizard data layer object
 * @param {scope} globals
 * @return {boolean} true when tracking started, false when there is no wizard to track yet
 */
function trackWizard(startEvent, stepEvent, abandonedEvent, wizardName, wizardTitle, globals) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  const wizard = document.getElementById(globals?.field?.$id) || document.querySelector('form .wizard');
  if (!wizard || wizard.dataset.wizardTracked === 'true') return false;
  wizard.dataset.wizardTracked = 'true';

  const form = wizard.closest('form') || document.querySelector('form');
  const titles = () => [...wizard.querySelectorAll('.wizard-menu-item')]
    .map((item) => item.textContent.trim());
  const pushWizard = (stepIndex) => {
    const stepTitles = titles();
    if (!stepTitles.length || typeof window.updateDataLayer !== 'function') return;
    window.updateDataLayer({
      wizard: {
        name: wizardName,
        title: wizardTitle,
        steps: stepTitles.map((title, index) => ({ name: `${wizardName}-step-${index + 1}`, title })),
        currentStep: stepIndex + 1,
      },
    });
  };
  const pushValues = () => {
    const updates = buildDataLayerUpdatesFromData(globals.functions.exportData());
    if (updates && typeof window.updateDataLayer === 'function') window.updateDataLayer(updates);
  };

  wizard.addEventListener('wizard:navigate', (event) => {
    const { prevStep, currStep } = event.detail || {};
    pushValues();
    if (Number.isFinite(prevStep?.index) && Number.isFinite(currStep?.index)
      && currStep.index > prevStep.index) {
      pushWizard(currStep.index);
      dispatchCustomEvent(stepEvent);
    }
  });

  let submitted = false;
  let abandoned = false;
  if (form) {
    form.addEventListener('submit', () => { submitted = true; }, true);
    form.addEventListener('click', (event) => {
      if (event.target?.closest?.('button[type="submit"]')) submitted = true;
    }, true);
  }
  const abandon = () => {
    if (submitted || abandoned) return;
    abandoned = true;
    dispatchCustomEvent(abandonedEvent);
  };
  window.addEventListener('pagehide', abandon);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') abandon();
  });

  pushWizard(0);
  dispatchCustomEvent(startEvent);
  return true;
}

// eslint-disable-next-line import/prefer-default-export
export {
  getFullName,
  days,
  submitFormArrayToString,
  pushFormToDataLayer,
  setLaunchIdentity,
  fireLaunchEvent,
  setMobileEventType,
  trackWizard,
};
