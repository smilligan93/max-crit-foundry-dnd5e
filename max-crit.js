import Item5e from "../../systems/dnd5e/module/item/entity.js";

/* -------------------------------------------- */

// Override rollDamage on Item5e. This is copy-pasta, the only changes are to `damageRoll` below
Item5e.prototype.rollDamage = function({event, spellLevel=null, versatile=false}={}) {
  console.log('HELLO WORLD');
  const itemData = this.data.data;
  const actorData = this.actor.data.data;
  if ( !this.hasDamage ) {
    throw new Error("You may not make a Damage Roll with this Item.");
  }
  const rollData = this.getRollData();
  if ( spellLevel ) rollData.item.level = spellLevel;

  // Define Roll parts
  const parts = itemData.damage.parts.map(d => d[0]);
  if ( versatile && itemData.damage.versatile ) parts[0] = itemData.damage.versatile;
  if ( (this.data.type === "spell") ) {
    if ( (itemData.scaling.mode === "cantrip") ) {
      const lvl = this.actor.data.type === "character" ? actorData.details.level : actorData.details.spellLevel;
      this._scaleCantripDamage(parts, lvl, itemData.scaling.formula );
    } else if ( spellLevel && (itemData.scaling.mode === "level") && itemData.scaling.formula ) {
      this._scaleSpellDamage(parts, itemData.level, spellLevel, itemData.scaling.formula );
    }
  }

  // Define Roll Data
  const actorBonus = actorData.bonuses[itemData.actionType] || {};
  if ( actorBonus.damage && parseInt(actorBonus.damage) !== 0 ) {
    parts.push("@dmg");
    rollData["dmg"] = actorBonus.damage;
  }

  // Call the roll helper utility
  const title = `${this.name} - Damage Roll`;
  const flavor = this.labels.damageTypes.length ? `${title} (${this.labels.damageTypes})` : title;
  return damageRoll({
    event: event,
    parts: parts,
    actor: this.actor,
    data: rollData,
    title: title,
    flavor: flavor,
    speaker: ChatMessage.getSpeaker({actor: this.actor}),
    dialogOptions: {
      width: 400,
      top: event ? event.clientY - 80 : null,
      left: window.innerWidth - 710
    }
  });
}


 // Copy of damageRoll from dice.js, but changes the _roll function to use max value on a crit dice
async function damageRoll({parts, actor, data, event={}, rollMode=null, template, title, speaker, flavor,
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
      // don't want to be pushing to the same object we iterate over
      [...parts].forEach(part => {
        if (regex.test(part)) {
          let gRegex = /\d+d\d+/g;
          let match = part.match(gRegex);
          match.forEach((m, index) => {
            let split = m.split('d');
            if (split.length === 2) {
              let count = Number(split[0]);
              let val = Number(split[1]);
              if (index === 0 && actor && actor.getFlag("dnd5e", "savageAttacks")) {
                if (game.settings.get('max-crit', 'bonusFeatRolls')) {
                  count += 1;
                } else {
                  parts.push(`1d${val}`);
                }
              }
              parts.push(count * val);
            }
          });
        }
      });
      if (bonus) {
        let gRegex = /\d+d\d+/g;
        let match = bonus.match(gRegex);
        match.forEach(m => {
          let split = m.split('d');
          if (split.length === 2) {
            let count = Number(split[0]);
            let val = Number(split[1]);
            if (game.settings.get('max-crit', 'bonusFieldRolls')) {
              bonus += `+${count * val}`;
            } else {
              bonus += `+${count}d${val}`;
            }
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

Hooks.on("ready", () => {
  game.settings.register('max-crit', 'bonusFeatRolls', {
      name: "Maximize Bonus Dice from feats (Savage Attacks)",
      description: "Include bonus dice from class or racial feats when calculating Max Crit",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
  });

  game.settings.register('max-crit', 'bonusFieldRolls', {
    name: "Maximize Situational Bonus Dice",
    description: "Include dice in the situational bonus field of the roll",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
});

