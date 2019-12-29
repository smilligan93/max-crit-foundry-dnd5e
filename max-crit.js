import { Dice5e } from "../../systems/dnd5e/module/dice.js";

const newDamageRoll = ({event={}, parts, actor, data, template, title, speaker, flavor, critical=true, onClose, dialogOptions}) => {
  // Inner roll function
  let rollMode = game.settings.get("core", "rollMode");
  let roll = crit => {
    let flav = ( flavor instanceof Function ) ? flavor(parts, data) : title;
    if ( crit === true ) {
      let regex = /\d+d\d+/;
      parts.forEach(part => {
          console.log(part);
          if (regex.test(part)) {
              let gRegex = /\d+d\d+/g;
              let match = part.match(gRegex);
              match.forEach(m => {
                  console.log(m);
                  let split = m.split('d');
                  if (split.length === 2) {
                      parts.push(split[0] * split[1]);
                  }
              });
          }
      });
      flav = `${title} (Critical)`;
    }

    let roll = new Roll(parts.join("+"), data);
    // roll.alter(add, mult);

    // Execute the roll and send it to chat
    roll.toMessage({
      speaker: speaker,
      flavor: flav,
      rollMode: rollMode
    });

    // Return the Roll object
    return roll;
  };

  // Modify the roll and handle fast-forwarding
  if ( event.shiftKey || event.ctrlKey || event.metaKey || event.altKey )  return roll(event.altKey);
  else parts = parts.concat(["@bonus"]);

  // Construct dialog data
  template = template || "systems/dnd5e/templates/chat/roll-dialog.html";
  let dialogData = {
    formula: parts.join(" + "),
    data: data,
    rollMode: rollMode,
    rollModes: CONFIG.rollModes
  };
  
  // Render modal dialog
  let crit = false;
  return new Promise(resolve => {
    renderTemplate(template, dialogData).then(dlg => {
      new Dialog({
        title: title,
        content: dlg,
        buttons: {
          critical: {
            condition: critical,
            label: "Critical Hit",
            callback: () => crit = true
          },
          normal: {
            label: critical ? "Normal" : "Roll",
          },
        },
        default: "normal",
        close: html => {
          if (onClose) onClose(html, parts, data);
          rollMode = html.find('[name="rollMode"]').val();
          data['bonus'] = html.find('[name="bonus"]').val();
          let r = roll(crit);
          resolve(r);
        }
      }, dialogOptions).render(true);
    });
  });
};

Hooks.on("ready", () => {
    Dice5e.damageRoll = newDamageRoll;
});
