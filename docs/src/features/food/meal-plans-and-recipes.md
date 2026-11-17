# Meal Plans and Recipes

The **Meal Plans** card on the **Foods** page has three ways to fill your recipe library and plan a week.

## Starter recipes

**Starter recipes** lists about 80 British and Irish recipes from the [Wikibooks Cookbook](https://en.wikibooks.org/wiki/Cookbook:Cuisine_of_the_United_Kingdom), such as Lancashire hotpot, toad in the hole, cullen skink and Welsh cakes. **Import** saves a recipe as an ordinary meal:

- each ingredient line is matched to a food from your library, [Intake24](/features/settings/intake24) or [CoFID](/features/settings/cofid); UK database foods are saved to your library so the meal can use them;
- salt, pepper and water are skipped; anything that cannot be matched is left out of the nutrition and listed in the meal's note, so check those;
- the method and a link to the source page (CC BY-SA 4.0) are kept in the meal's note.

These are community-written home recipes, not dietitian-written plans. Your server needs outbound access to `en.wikibooks.org`.

For your own recipes, the [Mealie or Tandoor integration](/features/settings/external-providers) imports recipes from almost any recipe website.

## Generate a plan from your meals

**Generate → From my saved meals** builds a week from the meals you have saved (imported, Mealie or your own):

- breakfast, lunch, dinner and snacks aim at 25%, 30%, 35% and 10% of your daily calorie goal, or of the target you type in;
- meals are placed by name (porridge at breakfast, soup at lunch, pies and stews at dinner, cakes and flapjacks as snacks) and portions are scaled by half servings, from ½ to 2;
- the same meal is not repeated in a slot on consecutive days when there is a choice.

## Generate a plan with AI

**Generate → AI-written recipes** asks your AI service (Settings → AI Service Settings) to write 13 recipes for your target and any preferences or allergies you type. Each recipe is saved as a meal the same way as a starter recipe, labelled as AI-written, then planned as above. AI recipes are not reviewed by a dietitian; check them before relying on them. This uses your AI provider and can take a few minutes.

## After generating

Generated plans are created **switched off**. Open the plan in **Meal Plans** to change anything, then turn it on to fill your diary, or use **Add to shopping list** to get the week's ingredients on your [shopping list](/features/food/shopping-list).
