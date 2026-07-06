import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting ALVM database seed...\n');

  // =========================================================================
  // 1. Admin user with credentials
  // =========================================================================
  console.log('👤 Creating admin user...');
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@alvm.nc' },
    update: { role: 'ADMIN' },
    create: {
      email: 'admin@alvm.nc',
      name: 'Admin ALVM',
      role: 'ADMIN',
      emailVerified: new Date(),
    },
  });

  const passwordHash = await bcrypt.hash('Test1234!', 12);
  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: 'credentials',
        providerAccountId: passwordHash,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      type: 'credentials',
      provider: 'credentials',
      providerAccountId: passwordHash,
    },
  });
  console.log('   ✓ admin@alvm.nc / Test1234!');

  // =========================================================================
  // 2. Staff users
  // =========================================================================
  console.log('👷 Creating staff users...');
  const staffData = [
    { email: 'sophie.martin@alvm.nc', name: 'Sophie Martin', first: 'Sophie', last: 'Martin', phone: '+687 75 12 34' },
    { email: 'thomas.dubois@alvm.nc', name: 'Thomas Dubois', first: 'Thomas', last: 'Dubois', phone: '+687 76 23 45' },
    { email: 'marie.leclerc@alvm.nc', name: 'Marie Leclerc', first: 'Marie', last: 'Leclerc', phone: '+687 77 34 56' },
  ];

  for (const s of staffData) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: { role: 'STAFF' },
      create: { email: s.email, name: s.name, role: 'STAFF', emailVerified: new Date() },
    });
    await prisma.staffMember.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, firstName: s.first, lastName: s.last, phone: s.phone, email: s.email },
    });
  }
  console.log('   ✓ 3 staff members');

  // =========================================================================
  // 3. Parents
  // =========================================================================
  console.log('👨‍👩‍👧 Creating parents...');
  const parentsData = [
    { email: 'martin.dupont@email.nc', name: 'Martin Dupont', first: 'Martin', last: 'Dupont', phone: '+687 75 12 34', address: '15 Rue de la Baie', city: 'Nouméa', postal: '98800' },
    { email: 'sophie.leblanc@email.nc', name: 'Sophie Leblanc', first: 'Sophie', last: 'Leblanc', phone: '+687 75 23 45', address: '22 Avenue du Maréchal Foch', city: 'Nouméa', postal: '98800' },
    { email: 'jp.bernard@email.nc', name: 'Jean-Pierre Bernard', first: 'Jean-Pierre', last: 'Bernard', phone: '+687 75 34 56', address: '8 Rue de la République', city: 'Dumbéa', postal: '98835' },
    { email: 'claire.rousseau@email.nc', name: 'Claire Rousseau', first: 'Claire', last: 'Rousseau', phone: '+687 75 45 67', address: '31 Boulevard Vauban', city: 'Nouméa', postal: '98800' },
    { email: 'pierre.lambert@email.nc', name: 'Pierre Lambert', first: 'Pierre', last: 'Lambert', phone: '+687 75 56 78', address: '12 Rue Georges Clemenceau', city: 'Mont-Dore', postal: '98809' },
    { email: 'marie.moreau@email.nc', name: 'Marie Moreau', first: 'Marie', last: 'Moreau', phone: '+687 75 67 89', address: '45 Avenue James Cook', city: 'Nouméa', postal: '98800' },
    { email: 'luc.fontaine@email.nc', name: 'Luc Fontaine', first: 'Luc', last: 'Fontaine', phone: '+687 75 78 90', address: '7 Rue de Sébastopol', city: 'Dumbéa', postal: '98835' },
    { email: 'isabelle.garnier@email.nc', name: 'Isabelle Garnier', first: 'Isabelle', last: 'Garnier', phone: '+687 75 89 01', address: '19 Rue de Verdun', city: 'Nouméa', postal: '98800' },
    { email: 'thomas.girard@email.nc', name: 'Thomas Girard', first: 'Thomas', last: 'Girard', phone: '+687 75 90 12', address: '26 Boulevard de la Somme', city: 'Mont-Dore', postal: '98809' },
    { email: 'emilie.roux@email.nc', name: 'Émilie Roux', first: 'Émilie', last: 'Roux', phone: '+687 75 01 23', address: '33 Rue Olry', city: 'Nouméa', postal: '98800' },
  ];

  const parentIds: string[] = [];
  for (const p of parentsData) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: { role: 'PARENT' },
      create: { email: p.email, name: p.name, role: 'PARENT', emailVerified: new Date() },
    });
    await prisma.parent.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        firstName: p.first,
        lastName: p.last,
        phone: p.phone,
        email: p.email,
        address: p.address,
        city: p.city,
        postalCode: p.postal,
      },
    });
    parentIds.push(user.id);
  }
  console.log('   ✓ 10 parents');

  // =========================================================================
  // 4. Children (25 total: 5 parents x 3, 5 parents x 2)
  // =========================================================================
  console.log('👶 Creating children...');

  type ChildData = {
    first: string;
    last: string;
    birth: string;
    gender: 'MALE' | 'FEMALE';
    ecole: string;
    emergName: string;
    emergPhone: string;
    emergRelation: string;
    parentIndex: number;
  };

  const childrenData: ChildData[] = [
    // Parent 1 (3 children)
    { first: 'Lucas', last: 'Dupont', birth: '2015-03-12', gender: 'MALE', ecole: "École Primaire de l'Anse Vata", emergName: 'Martin Dupont', emergPhone: '+687 75 12 34', emergRelation: 'father', parentIndex: 0 },
    { first: 'Emma', last: 'Dupont', birth: '2013-07-24', gender: 'FEMALE', ecole: 'Collège de Magenta', emergName: 'Martin Dupont', emergPhone: '+687 75 12 34', emergRelation: 'father', parentIndex: 0 },
    { first: 'Léa', last: 'Dupont', birth: '2016-11-08', gender: 'FEMALE', ecole: 'École Maternelle de la Baie', emergName: 'Martin Dupont', emergPhone: '+687 75 12 34', emergRelation: 'father', parentIndex: 0 },
    // Parent 2 (3 children)
    { first: 'Hugo', last: 'Leblanc', birth: '2014-05-15', gender: 'MALE', ecole: 'École Primaire du Receiving', emergName: 'Sophie Leblanc', emergPhone: '+687 75 23 45', emergRelation: 'mother', parentIndex: 1 },
    { first: 'Chloé', last: 'Leblanc', birth: '2012-09-03', gender: 'FEMALE', ecole: 'Collège de Tuband', emergName: 'Sophie Leblanc', emergPhone: '+687 75 23 45', emergRelation: 'mother', parentIndex: 1 },
    { first: 'Nathan', last: 'Leblanc', birth: '2017-01-19', gender: 'MALE', ecole: 'École Maternelle Foch', emergName: 'Sophie Leblanc', emergPhone: '+687 75 23 45', emergRelation: 'mother', parentIndex: 1 },
    // Parent 3 (3 children)
    { first: 'Mathis', last: 'Bernard', birth: '2015-06-20', gender: 'MALE', ecole: 'École Primaire de Dumbéa', emergName: 'Jean-Pierre Bernard', emergPhone: '+687 75 34 56', emergRelation: 'father', parentIndex: 2 },
    { first: 'Manon', last: 'Bernard', birth: '2013-10-11', gender: 'FEMALE', ecole: 'Collège de Dumbéa-sur-Mer', emergName: 'Jean-Pierre Bernard', emergPhone: '+687 75 34 56', emergRelation: 'father', parentIndex: 2 },
    { first: 'Théo', last: 'Bernard', birth: '2016-04-27', gender: 'MALE', ecole: 'École Maternelle de Koutio', emergName: 'Jean-Pierre Bernard', emergPhone: '+687 75 34 56', emergRelation: 'father', parentIndex: 2 },
    // Parent 4 (3 children)
    { first: 'Inès', last: 'Rousseau', birth: '2014-08-14', gender: 'FEMALE', ecole: 'École Primaire de Receiving', emergName: 'Claire Rousseau', emergPhone: '+687 75 45 67', emergRelation: 'mother', parentIndex: 3 },
    { first: 'Tom', last: 'Rousseau', birth: '2016-12-05', gender: 'MALE', ecole: 'École Maternelle de la Vallée du Tir', emergName: 'Claire Rousseau', emergPhone: '+687 75 45 67', emergRelation: 'mother', parentIndex: 3 },
    { first: 'Sarah', last: 'Rousseau', birth: '2012-02-18', gender: 'FEMALE', ecole: 'Collège du Grand Nouméa', emergName: 'Claire Rousseau', emergPhone: '+687 75 45 67', emergRelation: 'mother', parentIndex: 3 },
    // Parent 5 (3 children)
    { first: 'Louis', last: 'Lambert', birth: '2015-09-22', gender: 'MALE', ecole: 'École Primaire du Mont-Dore', emergName: 'Pierre Lambert', emergPhone: '+687 75 56 78', emergRelation: 'father', parentIndex: 4 },
    { first: 'Camille', last: 'Lambert', birth: '2013-05-30', gender: 'FEMALE', ecole: 'Collège de Plum', emergName: 'Pierre Lambert', emergPhone: '+687 75 56 78', emergRelation: 'father', parentIndex: 4 },
    { first: 'Jules', last: 'Lambert', birth: '2017-03-14', gender: 'MALE', ecole: 'École Maternelle de Yahoué', emergName: 'Pierre Lambert', emergPhone: '+687 75 56 78', emergRelation: 'father', parentIndex: 4 },
    // Parent 6 (2 children)
    { first: 'Gabriel', last: 'Moreau', birth: '2014-11-28', gender: 'MALE', ecole: "École Primaire de l'Orphelinat", emergName: 'Marie Moreau', emergPhone: '+687 75 67 89', emergRelation: 'mother', parentIndex: 5 },
    { first: 'Zoé', last: 'Moreau', birth: '2016-07-09', gender: 'FEMALE', ecole: 'École Maternelle de Motor Pool', emergName: 'Marie Moreau', emergPhone: '+687 75 67 89', emergRelation: 'mother', parentIndex: 5 },
    // Parent 7 (2 children)
    { first: 'Arthur', last: 'Fontaine', birth: '2015-02-16', gender: 'MALE', ecole: 'École Primaire de Koutio', emergName: 'Luc Fontaine', emergPhone: '+687 75 78 90', emergRelation: 'father', parentIndex: 6 },
    { first: 'Alice', last: 'Fontaine', birth: '2013-08-25', gender: 'FEMALE', ecole: 'Collège de Dumbéa-sur-Mer', emergName: 'Luc Fontaine', emergPhone: '+687 75 78 90', emergRelation: 'father', parentIndex: 6 },
    // Parent 8 (2 children)
    { first: 'Raphaël', last: 'Garnier', birth: '2014-04-07', gender: 'MALE', ecole: 'École Primaire de Montravel', emergName: 'Isabelle Garnier', emergPhone: '+687 75 89 01', emergRelation: 'mother', parentIndex: 7 },
    { first: 'Clara', last: 'Garnier', birth: '2016-10-13', gender: 'FEMALE', ecole: 'École Maternelle de Normandie', emergName: 'Isabelle Garnier', emergPhone: '+687 75 89 01', emergRelation: 'mother', parentIndex: 7 },
    // Parent 9 (2 children)
    { first: 'Maxime', last: 'Girard', birth: '2015-12-01', gender: 'MALE', ecole: 'École Primaire de Plum', emergName: 'Thomas Girard', emergPhone: '+687 75 90 12', emergRelation: 'father', parentIndex: 8 },
    { first: 'Jade', last: 'Girard', birth: '2013-03-26', gender: 'FEMALE', ecole: 'Collège de Plum', emergName: 'Thomas Girard', emergPhone: '+687 75 90 12', emergRelation: 'father', parentIndex: 8 },
    // Parent 10 (2 children)
    { first: 'Adam', last: 'Roux', birth: '2014-06-17', gender: 'MALE', ecole: 'École Primaire de Tina', emergName: 'Émilie Roux', emergPhone: '+687 75 01 23', emergRelation: 'mother', parentIndex: 9 },
    { first: 'Lina', last: 'Roux', birth: '2016-09-04', gender: 'FEMALE', ecole: 'École Maternelle de la Tranchée', emergName: 'Émilie Roux', emergPhone: '+687 75 01 23', emergRelation: 'mother', parentIndex: 9 },
  ];

  const childIds: string[] = [];
  for (const c of childrenData) {
    const child = await prisma.child.create({
      data: {
        firstName: c.first,
        lastName: c.last,
        birthDate: new Date(c.birth),
        gender: c.gender,
        ecole: c.ecole,
        emergencyContactName: c.emergName,
        emergencyContactPhone: c.emergPhone,
        emergencyContactRelation: c.emergRelation,
        medicalInfo: { allergies: [], medications: [], conditions: [], diet_restrictions: [], notes: '' },
      },
    });
    childIds.push(child.id);

    const relationship = c.emergRelation;
    await prisma.childParent.create({
      data: {
        childId: child.id,
        parentId: parentIds[c.parentIndex],
        isPrimary: true,
        relationship,
      },
    });
  }
  console.log('   ✓ 25 children with parent links');

  // =========================================================================
  // 5. Application settings
  // =========================================================================
  console.log('⚙️  Creating application settings...');
  const settings = [
    // organization
    { category: 'organization', key: 'name', value: '"ALVM"', description: "Nom de l'organisation" },
    { category: 'organization', key: 'short_name', value: '"ALVM"', description: 'Nom court (factures, emails)' },
    { category: 'organization', key: 'address', value: '"Nouméa"', description: "Adresse de l'organisation" },
    { category: 'organization', key: 'city', value: '"Nouméa"', description: 'Ville' },
    { category: 'organization', key: 'postal_code', value: '"98800"', description: 'Code postal' },
    { category: 'organization', key: 'country', value: '"Nouvelle-Calédonie"', description: 'Pays' },
    { category: 'organization', key: 'phone', value: '""', description: "Téléphone de l'organisation" },
    { category: 'organization', key: 'email', value: '"contact@alvm.nc"', description: "Email de contact de l'organisation" },
    { category: 'organization', key: 'logo_url', value: null, description: "URL du logo de l'organisation" },
    // documents
    { category: 'documents', key: 'invoice_footer', value: '"Facture à régler dans les 30 jours"', description: 'Mention en bas des factures' },
    { category: 'documents', key: 'child_form_footer', value: '"Document à conserver"', description: 'Mention en bas des fiches enfant' },
    // pricing
    { category: 'pricing', key: 'currency', value: '"XPF"', description: 'Devise (code ISO)' },
    { category: 'pricing', key: 'currency_symbol', value: '"XPF"', description: 'Symbole de devise affiché' },
    { category: 'pricing', key: 'default_camp_price', value: '5000', description: 'Prix par défaut par jour de camp (en XPF)' },
    // ALVM est exonérée de TGC (article LP 492 — Loi du pays N°2016-14). 0 est volontaire et légal.
    { category: 'pricing', key: 'tax_rate', value: '0', description: 'Taux de TGC en pourcentage (0 = exonération LP 492)' },
    { category: 'pricing', key: 'payment_terms_days', value: '30', description: 'Délai de paiement par défaut (jours)' },
    { category: 'pricing', key: 'credit_expiry_days', value: '365', description: 'Durée de validité des avoirs (jours)' },
    { category: 'pricing', key: 'payment_method_inactive_days', value: '30', description: 'Inactivité avant désactivation méthode de paiement (jours)' },
    // email — clés alignées avec le formulaire admin
    { category: 'email', key: 'from_name', value: '"ALVM"', description: "Nom d'expéditeur des emails" },
    { category: 'email', key: 'from_email', value: '"noreply@alvm.nc"', description: "Adresse email d'envoi" },
    { category: 'email', key: 'reply_to', value: '"contact@alvm.nc"', description: "Adresse email de réponse" },
    // accounting (FEC) — clés alignées avec le formulaire admin
    { category: 'accounting', key: 'fec_journal_code', value: '"VE"', description: "Code journal des ventes (FEC)" },
    { category: 'accounting', key: 'fec_sales_account', value: '"706000"', description: "Compte de ventes par défaut (FEC)" },
    { category: 'accounting', key: 'fec_customers_account', value: '"411000"', description: "Compte clients (FEC)" },
    { category: 'accounting', key: 'fec_company_code', value: '"ALVM"', description: "Code société (FEC)" },
  ];

  for (const s of settings) {
    await prisma.appSetting.upsert({
      where: { category_key: { category: s.category, key: s.key } },
      update: {},
      create: s,
    });
  }
  console.log(`   ✓ ${settings.length} settings`);

  // =========================================================================
  // 6. Camp types
  // =========================================================================
  console.log('🏕️  Creating camp types...');
  const campTypesData = [
    { name: 'Multi-activités', description: "Camps proposant une variété d'activités sportives, créatives et ludiques", accountingCode: '706100' },
    { name: 'Sport', description: 'Camps axés sur une discipline sportive spécifique', accountingCode: '706200' },
    { name: 'Nature & Environnement', description: "Découverte de la nature et sensibilisation à l'environnement", accountingCode: '706300' },
    { name: 'Arts & Culture', description: 'Activités artistiques et culturelles', accountingCode: '706400' },
    { name: 'Sciences & Technologie', description: 'Initiation aux sciences et aux nouvelles technologies', accountingCode: '706500' },
  ];

  const campTypeIds: Record<string, string> = {};
  for (const ct of campTypesData) {
    const campType = await prisma.campType.upsert({
      where: { name: ct.name },
      update: {},
      create: { ...ct, active: true },
    });
    campTypeIds[ct.name] = campType.id;
  }
  console.log('   ✓ 5 camp types');

  // =========================================================================
  // 7. Camps with camp days
  // =========================================================================
  console.log('⛺ Creating camps...');
  const staffUser = await prisma.user.findUnique({ where: { email: 'sophie.martin@alvm.nc' } });
  if (!staffUser) throw new Error('Staff user not found');

  const now = new Date();
  const addDays = (date: Date, days: number): Date => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  };

  type CampDef = {
    name: string;
    description: string;
    campType: string;
    location: string;
    maxCapacity: number;
    offsetDays: number;
    durationDays: number;
    deadlineOffset: number;
    pricePerDay: number;
    status: 'DRAFT' | 'PUBLISHED';
    themes?: string[];
  };

  const campsData: CampDef[] = [
    { name: 'Camp Multi-activités - Vacances de Juillet', description: 'Découvrez nos activités variées: sports, arts créatifs, jeux aquatiques et sorties nature.', campType: 'Multi-activités', location: "Plage de l'Anse Vata", maxCapacity: 30, offsetDays: 30, durationDays: 5, deadlineOffset: 7, pricePerDay: 3500, status: 'PUBLISHED', themes: ['Accueil et jeux de cohésion', 'Sports nautiques', 'Arts créatifs', 'Grande sortie nature', 'Jeux olympiques et spectacle'] },
    { name: 'Stage Football Intensif', description: 'Stage de perfectionnement football avec entraîneurs diplômés.', campType: 'Sport', location: 'Stade Numa-Daly', maxCapacity: 25, offsetDays: 45, durationDays: 7, deadlineOffset: 10, pricePerDay: 4000, status: 'PUBLISHED' },
    { name: 'Aventure Nature - Découverte de la faune calédonienne', description: 'Randonnées, observation de la faune, ateliers écologie.', campType: 'Nature & Environnement', location: 'Parc Provincial de la Rivière Bleue', maxCapacity: 20, offsetDays: 20, durationDays: 5, deadlineOffset: 5, pricePerDay: 3800, status: 'PUBLISHED' },
    { name: 'Atelier Théâtre et Arts Plastiques', description: 'Improvisation théâtrale, peinture, sculpture et spectacle de fin de stage.', campType: 'Arts & Culture', location: 'Centre Culturel Tjibaou', maxCapacity: 15, offsetDays: 60, durationDays: 5, deadlineOffset: 14, pricePerDay: 4200, status: 'PUBLISHED' },
    { name: 'Camp Robotique et Programmation', description: 'Construction de robots, coding, défis technologiques.', campType: 'Sciences & Technologie', location: 'Université de Nouvelle-Calédonie', maxCapacity: 18, offsetDays: 75, durationDays: 5, deadlineOffset: 15, pricePerDay: 4500, status: 'PUBLISHED' },
    { name: "Camp Multi-activités - Vacances d'Août", description: "Sports, jeux, créativité et excursions pour des vacances d'été exceptionnelles!", campType: 'Multi-activités', location: 'Baie des Citrons', maxCapacity: 28, offsetDays: 90, durationDays: 5, deadlineOffset: 20, pricePerDay: 3500, status: 'PUBLISHED' },
    { name: 'Stage Natation - Tous niveaux', description: 'Perfectionnement natation avec maîtres-nageurs diplômés.', campType: 'Sport', location: 'Piscine du Mont-Dore', maxCapacity: 22, offsetDays: 100, durationDays: 5, deadlineOffset: 21, pricePerDay: 3700, status: 'PUBLISHED' },
    { name: 'Exploration Marine - Snorkeling et Écologie', description: 'Découverte du lagon: snorkeling, identification des espèces.', campType: 'Nature & Environnement', location: 'Îlot Maître', maxCapacity: 16, offsetDays: 120, durationDays: 5, deadlineOffset: 30, pricePerDay: 5000, status: 'DRAFT' },
    { name: 'Stage Danse Hip-Hop et Moderne', description: 'Chorégraphies hip-hop et danse moderne. Spectacle de fin de stage.', campType: 'Arts & Culture', location: 'Studio Danse Nouméa', maxCapacity: 20, offsetDays: 50, durationDays: 5, deadlineOffset: 12, pricePerDay: 3900, status: 'PUBLISHED' },
    { name: "Camp Astronomie - Observation des Étoiles", description: "Observation nocturne, planétarium, ateliers scientifiques.", campType: 'Sciences & Technologie', location: 'Observatoire de Nouméa', maxCapacity: 12, offsetDays: 150, durationDays: 3, deadlineOffset: 45, pricePerDay: 5500, status: 'DRAFT' },
  ];

  const campIds: string[] = [];
  for (const c of campsData) {
    const startDate = addDays(now, c.offsetDays);
    const endDate = addDays(startDate, c.durationDays - 1);
    const deadline = addDays(startDate, -c.deadlineOffset);

    const camp = await prisma.camp.create({
      data: {
        name: c.name,
        description: c.description,
        campTypeId: campTypeIds[c.campType],
        location: c.location,
        maxCapacity: c.maxCapacity,
        startDate,
        endDate,
        registrationDeadline: deadline,
        pricePerDay: c.pricePerDay,
        status: c.status,
        createdBy: staffUser.id,
      },
    });
    campIds.push(camp.id);

    // Create camp days
    for (let d = 0; d < c.durationDays; d++) {
      const dayDate = addDays(startDate, d);
      await prisma.campDay.create({
        data: {
          campId: camp.id,
          date: dayDate,
          theme: c.themes?.[d] ?? null,
        },
      });
    }
  }
  console.log(`   ✓ ${campsData.length} camps with camp days`);

  // =========================================================================
  // 8. Registrations (50 PENDING, 2 per child on PUBLISHED camps)
  // =========================================================================
  console.log('📝 Creating registrations...');

  const publishedCamps = await prisma.camp.findMany({
    where: { status: 'PUBLISHED' },
    include: { days: { orderBy: { date: 'asc' } } },
    orderBy: { startDate: 'asc' },
  });

  let regCount = 0;
  for (let i = 0; i < childIds.length; i++) {
    const childId = childIds[i];

    // Get the parent for this child
    const childParent = await prisma.childParent.findFirst({
      where: { childId, isPrimary: true },
    });
    if (!childParent) continue;

    // First registration: camp (i % 8), 3 days
    const camp1 = publishedCamps[i % publishedCamps.length];
    const days1 = camp1.days.slice(0, 3).map((d) => d.id);

    try {
      await prisma.registration.create({
        data: {
          campId: camp1.id,
          childId,
          parentId: childParent.parentId,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          selectedDays: days1,
        },
      });
      regCount++;
    } catch {
      // Unique constraint violation (child already registered to this camp)
    }

    // Second registration: camp ((i+1) % 8), all days
    const camp2 = publishedCamps[(i + 1) % publishedCamps.length];
    const days2 = camp2.days.map((d) => d.id);

    try {
      await prisma.registration.create({
        data: {
          campId: camp2.id,
          childId,
          parentId: childParent.parentId,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          selectedDays: days2,
        },
      });
      regCount++;
    } catch {
      // Unique constraint violation
    }
  }
  console.log(`   ✓ ${regCount} PENDING registrations`);

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n✅ Seed completed!');
  console.log('📋 Summary:');
  console.log('   - 1 admin (admin@alvm.nc / Test1234!)');
  console.log('   - 3 staff members');
  console.log('   - 10 parents');
  console.log('   - 25 children');
  console.log('   - 9 app settings');
  console.log('   - 5 camp types');
  console.log(`   - ${campsData.length} camps`);
  console.log(`   - ${regCount} registrations`);
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
