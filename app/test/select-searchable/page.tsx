'use client';

/**
 * Page de test pour le composant SelectSearchable
 *
 * Cette page démontre l'utilisation du composant SelectSearchable
 * avec différents cas d'usage.
 */

import { useState } from 'react';
import { SelectSearchable } from '@/components/ui/select-searchable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function SelectSearchableTestPage() {
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedLargeList, setSelectedLargeList] = useState<string>('');

  // Liste de pays
  const countries = [
    { value: 'fr', label: 'France' },
    { value: 'nc', label: 'Nouvelle-Calédonie' },
    { value: 'us', label: 'États-Unis' },
    { value: 'ca', label: 'Canada' },
    { value: 'uk', label: 'Royaume-Uni' },
    { value: 'de', label: 'Allemagne' },
    { value: 'es', label: 'Espagne' },
    { value: 'it', label: 'Italie' },
    { value: 'jp', label: 'Japon' },
    { value: 'cn', label: 'Chine' },
  ];

  // Liste de couleurs
  const colors = [
    { value: 'red', label: 'Rouge' },
    { value: 'blue', label: 'Bleu' },
    { value: 'green', label: 'Vert' },
    { value: 'yellow', label: 'Jaune' },
    { value: 'purple', label: 'Violet' },
    { value: 'orange', label: 'Orange' },
    { value: 'pink', label: 'Rose' },
    { value: 'black', label: 'Noir' },
    { value: 'white', label: 'Blanc' },
  ];

  // Grande liste (100 items) pour tester la performance
  const largeList = Array.from({ length: 100 }, (_, i) => ({
    value: `item-${i + 1}`,
    label: `Option numéro ${i + 1}`,
  }));

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Test SelectSearchable</h1>
        <p className="text-muted-foreground mt-2">
          Démonstration du composant SelectSearchable avec recherche intégrée
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Test 1: Liste courte */}
        <Card>
          <CardHeader>
            <CardTitle>Liste courte (10 pays)</CardTitle>
            <CardDescription>
              Tester la recherche avec une liste de pays
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SelectSearchable
              options={countries}
              value={selectedCountry}
              onValueChange={setSelectedCountry}
              placeholder="Sélectionnez un pays..."
              searchPlaceholder="Rechercher un pays..."
            />
            {selectedCountry && (
              <div className="text-sm">
                <span className="text-muted-foreground">Sélection : </span>
                <Badge>{countries.find(c => c.value === selectedCountry)?.label}</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test 2: Liste avec couleurs */}
        <Card>
          <CardHeader>
            <CardTitle>Liste moyenne (9 couleurs)</CardTitle>
            <CardDescription>
              Tester avec des options de couleurs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SelectSearchable
              options={colors}
              value={selectedColor}
              onValueChange={setSelectedColor}
              placeholder="Choisir une couleur..."
              searchPlaceholder="Rechercher..."
            />
            {selectedColor && (
              <div className="text-sm">
                <span className="text-muted-foreground">Couleur : </span>
                <Badge>{colors.find(c => c.value === selectedColor)?.label}</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test 3: Grande liste */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Grande liste (100 items)</CardTitle>
            <CardDescription>
              Tester la performance de la recherche avec une grande liste
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SelectSearchable
              options={largeList}
              value={selectedLargeList}
              onValueChange={setSelectedLargeList}
              placeholder="Sélectionner une option..."
              searchPlaceholder="Rechercher dans 100 options..."
            />
            {selectedLargeList && (
              <div className="text-sm">
                <span className="text-muted-foreground">Sélection : </span>
                <Badge>{largeList.find(i => i.value === selectedLargeList)?.label}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Instructions de test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <strong>✅ À tester :</strong>
          </div>
          <ul className="list-disc pl-6 space-y-1">
            <li>Ouvrir le sélecteur et taper dans la barre de recherche</li>
            <li>Navigation au clavier (flèches haut/bas + Enter)</li>
            <li>Fermeture avec Escape</li>
            <li>Clear de la recherche avec le bouton X</li>
            <li>Sélection avec la souris</li>
            <li>Performance avec la grande liste (100 items)</li>
            <li>Affichage "Aucun résultat trouvé" si recherche vide</li>
            <li>Compteur de résultats dans le footer</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
