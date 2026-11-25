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
 * Pushes the form values to the data layer.
 * @name pushFormToDataLayer Push form to data layer
 * @param {scope} globals
 * @return {boolean}
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
 * Stores the email so Launch and the Web SDK can identify the user.
 * @name setLaunchIdentity Set Launch identity
 * @param {string} email
 * @return {boolean}
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
 * Fires a Launch event with a copy of the current data layer.
 * @name fireLaunchEvent Fire Launch event
 * @param {string} eventName
 * @return {boolean}
 */
function fireLaunchEvent(eventName) {
  return dispatchCustomEvent(eventName);
}

/**
 * Sets the event type the mobile app sends for this form. Does nothing in the browser.
 * @name setMobileEventType Set mobile event type
 * @param {string} eventType
 * @return {string}
 */
function setMobileEventType(eventType) {
  // Does nothing in the browser. The rule only stores the value for the mobile app export to read.
  return String(eventType || '').trim();
}

const WIZARD_CHANNEL = 'trackWizard';

/**
 * The form's current values by field name, read from the page. A name is a data layer path.
 * @private
 */
function readFormValues(form) {
  const data = {};
  [...form.elements].forEach((el) => {
    if (!el.name || el.disabled || el.tagName === 'FIELDSET' || el.tagName === 'BUTTON') return;
    if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
    data[el.name] = el.value;
  });
  return data;
}

/**
 * @private
 */
function findWizard(wizardId) {
  const byId = wizardId ? document.querySelector(`[data-id="${wizardId}"]`) : null;
  return (byId && (byId.classList.contains('wizard') ? byId : byId.querySelector('.wizard')))
    || document.querySelector('form .wizard');
}

/**
 * Waits for the wizard to be rendered: the rule runs in the worker, before any HTML exists.
 * @private
 */
function whenWizardRendered(wizardId, callback) {
  const found = findWizard(wizardId);
  if (found) {
    callback(found);
    return;
  }
  const observer = new MutationObserver(() => {
    const wizard = findWizard(wizardId);
    if (wizard) {
      observer.disconnect();
      callback(wizard);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 15000);
}

/**
 * @private
 */
function startWizardTracking(config) {
  whenWizardRendered(config.wizardId, (wizard) => {
    if (wizard.dataset.wizardTracked === 'true') return;
    wizard.dataset.wizardTracked = 'true';
    const {
      startEvent, stepEvent, abandonedEvent, wizardName, wizardTitle,
    } = config;
    const form = wizard.closest('form') || document.querySelector('form');

    const pushWizard = (stepIndex) => {
      const titles = [...wizard.querySelectorAll('.wizard-menu-item')]
        .map((item) => item.textContent.trim());
      if (!titles.length || typeof window.updateDataLayer !== 'function') return;
      window.updateDataLayer({
        wizard: {
          name: wizardName,
          title: wizardTitle,
          steps: titles.map((title, index) => (
            { name: `${wizardName}-step-${index + 1}`, title }
          )),
          currentStep: stepIndex + 1,
        },
      });
    };
    const pushValues = () => {
      const updates = buildDataLayerUpdatesFromData(form ? readFormValues(form) : {});
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
  });
}

// The page side of trackWizard. This module is loaded in the page before the rule engine's worker
// starts, so the listener is in place when the worker's initialize rule sends its message.
let wizardChannel;
if (typeof document !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
  wizardChannel = new BroadcastChannel(WIZARD_CHANNEL);
  wizardChannel.onmessage = (event) => startWizardTracking(event.data || {});
}

/**
 * Tracks a wizard form: start, each step forward, and leaving before submit.
 * @name trackWizard Track wizard
 * @param {string} startEvent
 * @param {string} stepEvent
 * @param {string} abandonedEvent
 * @param {string} wizardName
 * @param {string} wizardTitle
 * @param {scope} globals
 */
function trackWizard(startEvent, stepEvent, abandonedEvent, wizardName, wizardTitle, globals) {
  // Returns nothing on purpose: the rule engine assigns a returned value to the field the rule
  // sits on, and a wizard (fieldset) has no setter for value, which stops the form from loading.
  const config = {
    startEvent,
    stepEvent,
    abandonedEvent,
    wizardName,
    wizardTitle,
    wizardId: globals?.field?.$id,
  };
  if (typeof document !== 'undefined') {
    // Called on the page itself: no worker in between.
    startWizardTracking(config);
    return;
  }
  // Called in the rule engine's worker, which has no page: hand the work to the page.
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(WIZARD_CHANNEL);
  channel.postMessage(config);
  channel.close();
}

/**
 * Pushes the data layer, sets the identity, fires the Launch event and submits the form.
 * @name trackSubmit Track and submit
 * @param {string} eventName
 * @param {string} email
 * @param {scope} globals
 * @return {boolean}
 */
function trackSubmit(eventName, email, globals) {
  // The same steps as pushFormToDataLayer, setLaunchIdentity and fireLaunchEvent, run in this order
  // only for a valid form, then the default submit that a click rule would otherwise replace.
  const errors = globals.functions.validate();
  if (Array.isArray(errors) && errors.length) return false;
  pushFormToDataLayer(globals);
  setLaunchIdentity(email);
  fireLaunchEvent(eventName);
  globals.functions.submitForm(globals.functions.exportData(), true, 'multipart/form-data');
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
  trackSubmit,
};
