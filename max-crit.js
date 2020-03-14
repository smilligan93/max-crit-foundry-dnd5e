import { Dice5e } from "../../systems/dnd5e/module/dice.js";

export class CustomDice5e {
  static async damageRoll({event={}, parts, actor, data, template, title, speaker, flavor, critical=true, onClose, dialogOptions}) {
    
    // Handle input arguments
    flavor = flavor || title;
    const rollMode = game.settings.get("core", "rollMode");
    let rolled = false;

    // Define inner roll function
    const _roll = function(parts, crit, form) {
      let bonus = form ? form.find('[name="bonus"]').val() : 0;

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
        flavor = `${title} (Critical)`;
      }

      data['bonus'] = bonus;
      // Include bonus
      let roll = new Roll(parts.join("+"), data);
    
      // Convert the roll to a chat message
      roll.toMessage({
        speaker: speaker,
        flavor: flavor,
        rollMode: form ? form.find('[name="rollMode"]').val() : rollMode
      });
      rolled = true;
      return roll;
    };
    
    // Modify the roll and handle fast-forwarding
    if ( event.shiftKey || event.ctrlKey || event.metaKey || event.altKey ) return _roll(parts, event.altKey);
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
            condition: critical,
            label: "Critical Hit",
            callback: html => roll = _roll(parts, true, html)
          },
          normal: {
            label: critical ? "Normal" : "Roll",
            callback: html => roll = _roll(parts, false, html)
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
