export function petGender(pet = {}) {
  return pet.sex === 'дівчинка' || pet.sex === 'female' ? 'female' : 'male';
}

export function isFemale(pet = {}) {
  return petGender(pet) === 'female';
}

export function pickByGender(pet, forms) {
  return isFemale(pet) ? forms.female : forms.male;
}

export function petKind(pet = {}, form = 'short') {
  const cat = pet.petType === 'cat';
  if (form === 'profile') {
    if (cat) return pickByGender(pet, { male: 'кіт', female: 'кішка' });
    return pickByGender(pet, { male: 'пес', female: 'собака' });
  }
  if (cat) return pickByGender(pet, { male: 'котик', female: 'киця' });
  return pickByGender(pet, { male: 'песик', female: 'собака' });
}

export function pronoun(pet = {}, type = 'subject') {
  const female = isFemale(pet);
  const forms = {
    subject: female ? 'вона' : 'він',
    object: female ? 'її' : 'його',
    possessive: female ? 'її' : 'його',
    dative: female ? 'їй' : 'йому',
  };
  return forms[type] || forms.subject;
}

export function did(pet, male, female) {
  return pickByGender(pet, { male, female });
}

export function ready(pet) {
  return did(pet, 'готовий', 'готова');
}

export function calm(pet) {
  return did(pet, 'спокійний', 'спокійна');
}

export function alone(pet) {
  return did(pet, 'сам', 'сама');
}

export function bathroomAction(pet, type) {
  const female = isFemale(pet);
  const actions = {
    pee_success: female ? 'Пісяла правильно' : 'Пісяв правильно',
    pee_miss: 'Промах',
    poo_success: female ? 'Какала правильно' : 'Какав правильно',
    poo_miss: 'Мимо',
  };
  return actions[type] || '';
}
