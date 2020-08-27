import Item5e from "../../systems/dnd5e/module/item/entity.js";

/* -------------------------------------------- */

// Override rollDamage on Item5e. This is copy-pasta, the only changes are to `damageRoll` below
Item5e.prototype.rollDamage = function({event, spellLevel=null, versatile=false}={}) {
  const itemData = this.data.data;
  const actorData = this.actor.data.data;
  if ( !this.hasDamage ) {
    throw new Error("You may not make a Damage Roll with this Item.");
  }
  const messageData = {"flags.dnd5e.roll": {type: "damage", itemId: this.id }};

  // Get roll data
  const rollData = this.getRollData();
  if ( spellLevel ) rollData.item.level = spellLevel;

  // Get message labels
  const title = `${this.name} - ${game.i18n.localize("DND5E.DamageRoll")}`;
  let flavor = this.labels.damageTypes.length ? `${title} (${this.labels.damageTypes})` : title;

  // Define Roll parts
  const parts = itemData.damage.parts.map(d => d[0]);

  // Adjust damage from versatile usage
  if ( versatile && itemData.damage.versatile ) {
    parts[0] = itemData.damage.versatile;
    messageData["flags.dnd5e.roll"].versatile = true;
  }

  // Scale damage from up-casting spells
  if ( (this.data.type === "spell") ) {
    if ( (itemData.scaling.mode === "cantrip") ) {
      const level = this.actor.data.type === "character" ? actorData.details.level : actorData.details.spellLevel;
      this._scaleCantripDamage(parts, itemData.scaling.formula, level, rollData);
    }
    else if ( spellLevel && (itemData.scaling.mode === "level") && itemData.scaling.formula ) {
      const scaling = itemData.scaling.formula;
      this._scaleSpellDamage(parts, itemData.level, spellLevel, scaling, rollData);
    }
  }

  // Define Roll Data
  const actorBonus = getProperty(actorData, `bonuses.${itemData.actionType}`) || {};
  if ( actorBonus.damage && parseInt(actorBonus.damage) !== 0 ) {
    parts.push("@dmg");
    rollData["dmg"] = actorBonus.damage;
  }

  // Ammunition Damage
  if ( this._ammo ) {
    parts.push("@ammo");
    rollData["ammo"] = this._ammo.data.data.damage.parts.map(p => p[0]).join("+");
    flavor += ` [${this._ammo.name}]`;
    delete this._ammo;
  }

  // Call the roll helper utility
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
    },
    messageData
  });
}

export async function damageRoll({parts, actor, data, event={}, rollMode=null, template, title, speaker, flavor,
                                   allowCritical=true, critical=false, fastForward=null, dialogOptions, chatMessage=true, messageData={}}={}) {

  // Prepare Message Data
  messageData.flavor = flavor || title;
  messageData.speaker = speaker || ChatMessage.getSpeaker();
  const messageOptions = {rollMode: rollMode || game.settings.get("core", "rollMode")};
  parts = parts.concat(["@bonus"]);
  fastForward = fastForward ?? (event && (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey));

  /// BEGIN CUSTOM

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
      messageData.flavor += ` (${game.i18n.localize("DND5E.Critical")})`;
      if ( "flags.dnd5e.roll" in messageData ) messageData["flags.dnd5e.roll"].critical = true;
    }

    data['bonus'] = bonus;
    // if (!data["bonus"]) parts.pop();
    // Include bonus
    let roll = new Roll(parts.join("+"), data);

    if (form) {
      messageOptions.rollMode = form.rollMode.value;
    }

    // Execute the roll
    try {
      return roll.roll();
    } catch(err) {
      console.error(err);
      ui.notifications.error(`Dice roll evaluation failed: ${err.message}`);
      return null;
    }
  };

  /// END CUSTOM

  // Create the Roll instance
  const roll = fastForward ? _roll(parts, critical || event.altKey) : await _damageRollDialog({
    template, title, parts, data, allowCritical, rollMode: messageOptions.rollMode, dialogOptions, roll: _roll
  });

  // Create a Chat Message
  if ( roll && chatMessage ) roll.toMessage(messageData, messageOptions);
  return roll;
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

// DIRECTLY COPIED FROM dice.js
/* -------------------------------------------- */

async function _damageRollDialog({template, title, parts, data, allowCritical, rollMode, dialogOptions, roll}={}) {

  // Render modal dialog
  template = template || "systems/dnd5e/templates/chat/roll-dialog.html";
  let dialogData = {
    formula: parts.join(" + "),
    data: data,
    rollMode: rollMode,
    rollModes: CONFIG.Dice.rollModes
  };
  const html = await renderTemplate(template, dialogData);

  // Create the Dialog window
  return new Promise(resolve => {
    new Dialog({
      title: title,
      content: html,
      buttons: {
        critical: {
          condition: allowCritical,
          label: game.i18n.localize("DND5E.CriticalHit"),
          callback: html => resolve(roll(parts, true, html[0].querySelector("form")))
        },
        normal: {
          label: game.i18n.localize(allowCritical ? "DND5E.Normal" : "DND5E.Roll"),
          callback: html => resolve(roll(parts, false, html[0].querySelector("form")))
        },
      },
      default: "normal",
      close: () => resolve(null)
    }, dialogOptions).render(true);
  });
}

