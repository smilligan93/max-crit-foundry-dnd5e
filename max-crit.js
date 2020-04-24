import { Dice5e } from "../../systems/dnd5e/module/dice.js";

export class CustomDice5e {
  /* -------------------------------------------- */

  /**
   * A standardized helper function for managing core 5e "d20 rolls"
   *
   * Holding SHIFT, ALT, or CTRL when the attack is rolled will "fast-forward".
   * This chooses the default options of a normal attack with no bonus, Critical, or no bonus respectively
   *
   * @param {Array} parts           The dice roll component parts, excluding the initial d20
   * @param {Actor} actor           The Actor making the damage roll
   * @param {Object} data           Actor or item data against which to parse the roll
   * @param {Event|object}[event    The triggering event which initiated the roll
   * @param {string} rollMode       A specific roll mode to apply as the default for the resulting roll
   * @param {String} template       The HTML template used to render the roll dialog
   * @param {String} title          The dice roll UI window title
   * @param {Object} speaker        The ChatMessage speaker to pass when creating the chat
   * @param {string} flavor         Flavor text to use in the posted chat message
   * @param {boolean} allowCritical Allow the opportunity for a critical hit to be rolled
   * @param {Boolean} critical      Flag this roll as a critical hit for the purposes of fast-forward rolls
   * @param {Boolean} fastForward   Allow fast-forward advantage selection
   * @param {Function} onClose      Callback for actions to take when the dialog form is closed
   * @param {Object} dialogOptions  Modal dialog options
   *
   * @return {Promise}              A Promise which resolves once the roll workflow has completed
   */
  static async damageRoll({parts, actor, data, event={}, rollMode=null, template, title, speaker, flavor,
                            allowCritical=true, critical=false, fastForward=null, onClose, dialogOptions}) {

    // Handle input arguments
    flavor = flavor || title;
    speaker = speaker || ChatMessage.getSpeaker();
    rollMode = game.settings.get("core", "rollMode");
    let rolled = false;

    // Define inner roll function
    const _roll = function(parts, crit, form) {
      let bonus = form ? form.bonus.value : 0;

      // Modify the damage formula for critical hits
      if ( crit === true ) {
        let regex = /\d+d\d+/;
        parts.forEach(part => {
          if (regex.test(part)) {
            let gRegex = /\d+d\d+/g;
            let match = part.match(gRegex);
            match.forEach((m, index) => {
              let split = m.split('d');
              if (split.length === 2) {
                let count = Number(split[0]);
                let val = Number(split[1]);
                if (index === 0 && actor && actor.getFlag("dnd5e", "savageAttacks")) count += 1;
                parts.push(count * val);
              }
            });
          }
        });
        if (bonus) {
          let gRegex = /\d+d\d+/g;
          let match = bonus.match(gRegex);
          match.forEach((m, index) => {
            let split = m.split('d');
            if (split.length === 2) {
              let count = Number(split[0]);
              let val = Number(split[1]);
              bonus += `+${count * val}`;
            }
          });
        }
        flavor = `${flavor} (${game.i18n.localize("DND5E.Critical")})`;
      }

      data['bonus'] = bonus;
      // Include bonus
      let roll = new Roll(parts.join("+"), data);

      rollMode = form ? form.rollMode.value : rollMode;
      // Convert the roll to a chat message
      roll.toMessage({
        speaker: speaker,
        flavor: flavor,
      }, { rollMode });
      rolled = true;
      return roll;
    };

    // Determine whether the roll can be fast-forward
    if ( fastForward === null ) {
      fastForward = event && (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey);
    }

    // Modify the roll and handle fast-forwarding
    if ( fastForward ) return _roll(parts, critical || event.altKey);
    else parts = parts.concat(["@bonus"]);

    // Render modal dialog
    template = template || "systems/dnd5e/templates/chat/roll-dialog.html";
    let dialogData = {
      formula: parts.join(" + "),
      data: data,
      rollMode: rollMode,
      rollModes: CONFIG.rollModes
    };
    const html = await renderTemplate(template, dialogData);

    // Create the Dialog window
    let roll;
    return new Promise(resolve => {
      new Dialog({
        title: title,
        content: html,
        buttons: {
          critical: {
            condition: allowCritical,
            label: game.i18n.localize("DND5E.CriticalHit"),
            callback: html => roll = _roll(parts, true, html[0].children[0])
          },
          normal: {
            label: game.i18n.localize(allowCritical ? "DND5E.Normal" : "DND5E.Roll"),
            callback: html => roll = _roll(parts, false, html[0].children[0])
          },
        },
        default: "normal",
        close: html => {
          if (onClose) onClose(html, parts, data);
          resolve(rolled ? roll : false);
        }
      }, dialogOptions).render(true);
    });
  }
}

Hooks.on("ready", () => {
    Dice5e.damageRoll = CustomDice5e.damageRoll;
});
