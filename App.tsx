import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ActivityIndicator,
  Alert,
  TextInput,
  FlatList,
  Text,
  TouchableOpacity,
  Button,
  ScrollView,
} from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { MaterialIcons } from '@expo/vector-icons'; // Para o ícone de minimizar/maximizar
import AsyncStorage from '@react-native-async-storage/async-storage';

MapboxGL.setAccessToken('sk.eyJ1IjoiZGV2Y2FybG9zaGVucmlxdWUiLCJhIjoiY21kNWd0cDc5MDZ5cjJrcHNkZ3duemRtNCJ9.87deCUdFAtouGyDW08uZLw');

const RotaMap = () => {
  const [coordinates, setCoordinates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [waypoints, setWaypoints] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [cameraCenter, setCameraCenter] = useState(null);
  const [cameraZoom, setCameraZoom] = useState(14);
  const [controlsMinimized, setControlsMinimized] = useState(false);
  const [hasLoadedInitialState, setHasLoadedInitialState] = useState(false); // Novo estado para controlar o carregamento inicial

  const mapRef = useRef();
  const cameraRef = useRef();
  const locationSubscription = useRef(null);

  const tomtomKey = 'ce0mxmVHLsE32V5dLUErIiIrMoyYXI7a';

  const saveState = async () => {
    try {
      await AsyncStorage.setItem('savedWaypoints', JSON.stringify(waypoints));
      await AsyncStorage.setItem('savedSearchQuery', searchQuery);
      // console.log('Dados salvos com sucesso!'); // Descomente para depuração
    } catch (error) {
      console.error('Erro ao salvar dados:', error);
    }
  };

  const loadState = async () => {
    try {
      const savedWaypoints = await AsyncStorage.getItem('savedWaypoints');
      const savedSearchQuery = await AsyncStorage.getItem('savedSearchQuery');
      if (savedWaypoints !== null) {
        setWaypoints(JSON.parse(savedWaypoints));
      }
      if (savedSearchQuery !== null) {
        setSearchQuery(savedSearchQuery);
      }
      // console.log('Dados carregados com sucesso!'); // Descomente para depuração
      setHasLoadedInitialState(true); // Marca que o estado inicial foi carregado
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  const fetchSuggestions = async (query) => {
    if (!query) {
      setSuggestions([]);
      return;
    }
    const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?key=${tomtomKey}&typeahead=true&limit=5&countrySet=BR`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.results) {
        setSuggestions(data.results);
      }
    } catch (error) {
      console.error("Erro ao buscar sugestões:", error);
      setSuggestions([]);
    }
  };

  const fetchRoute = useCallback(async () => {
    if (waypoints.length < 2) {
      Alert.alert('Pontos insuficientes', 'Adicione pelo menos um ponto de partida e um de destino.');
      return;
    }

    const origin = waypoints[0];
    const destination = waypoints[waypoints.length - 1];
    const intermediateWaypoints = waypoints.slice(1, -1);

    try {
      setLoading(true);
      let url = `https://api.tomtom.com/routing/1/calculateRoute/${origin.latitude},${origin.longitude}:`;

      if (intermediateWaypoints.length > 0) {
        intermediateWaypoints.forEach(wp => {
          url += `${wp.latitude},${wp.longitude}:`;
        });
      }

      url += `${destination.latitude},${destination.longitude}/json?key=${tomtomKey}&vehicleHeight=7.0&vehicleWidth=2.5&vehicleLength=12&vehicleWeight=20000&travelMode=truck`;

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok || !data.routes || !data.routes.length) {
        Alert.alert('Erro ao buscar rota', 'Verifique as coordenadas ou os parâmetros do veículo.');
        setCoordinates([]);
        return;
      }

      const points = data.routes[0].legs.flatMap(leg => leg.points);
      const coords = points.map(({ latitude, longitude }) => [longitude, latitude]);
      setCoordinates(coords);

      if (coords.length > 0 && cameraRef.current) {
        let minX = coords[0][0], minY = coords[0][1];
        let maxX = coords[0][0], maxY = coords[0][1];

        coords.forEach(([lon, lat]) => {
          minX = Math.min(minX, lon);
          minY = Math.min(minY, lat);
          maxX = Math.max(maxX, lon);
          maxY = Math.max(maxY, lat);
        });

        cameraRef.current.fitBounds(
          [minX, minY],
          [maxX, maxY],
          [100, 100, 100, 100],
          0
        );
      }

    } catch (error) {
      Alert.alert('Erro de conexão', 'Não foi possível obter a rota.');
      console.error("Erro ao buscar rota:", error);
      setCoordinates([]);
    } finally {
      setLoading(false);
    }
  }, [waypoints]);

  const handleSuggestionSelect = (item) => {
    const newWaypoint = {
      latitude: item.position.lat,
      longitude: item.position.lon,
      address: item.address.freeformAddress,
    };
    setWaypoints(prevWaypoints => {
      // Sempre adiciona o novo ponto no final
      return [...prevWaypoints, newWaypoint];
    });
    setSearchQuery('');
    setSuggestions([]);
  };

  const removeWaypoint = (indexToRemove) => {
    setWaypoints(prevWaypoints => prevWaypoints.filter((_, index) => index !== indexToRemove));
    setCoordinates([]);
  };

  const centerOnUser = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'É necessário permitir a localização.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude, longitude } = loc.coords;
    setCurrentLocation({ latitude, longitude });
    setCameraCenter([longitude, latitude]);
    setCameraZoom(14);

    // APENAS ATUALIZA O PRIMEIRO WAYPOINT SE O BOTÃO "MINHA POSIÇÃO" FOR CLICADO
    setWaypoints(prevWaypoints => {
      const updated = [...prevWaypoints];
      updated[0] = { latitude, longitude, address: 'Sua Localização Atual' };
      return updated;
    });
  };

  useEffect(() => {
    // Carrega o estado uma vez e define o flag
    const initializeState = async () => {
        await loadState();
        // APENAS CENTRALIZA NO USUÁRIO SE NÃO HOUVER WAYPOINTS SALVOS PELO ASYNCSTORAGE
        // OU SE O hasLoadedInitialState AINDA NÃO FOR TRUE
        if (waypoints.length === 0 && !hasLoadedInitialState) {
            await centerOnUser(); // Chame centerOnUser para definir o primeiro waypoint como a localização atual
        }
    };
    initializeState();

    const startLocationTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão negada', 'É necessário permitir a localização para rastreamento.');
        return;
      }

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10,
        },
        (loc) => {
          const { latitude, longitude } = loc.coords;
          setCurrentLocation({ latitude, longitude });
          // A câmera segue o usuário apenas se não houver rota ativa
          if (coordinates.length === 0) {
             setCameraCenter([longitude, latitude]);
          }

          // Atualiza o primeiro waypoint (ponto de partida) **apenas se a rota estiver ativa**
          // ou se a localização atual for o único waypoint (ou seja, o usuário não adicionou outros pontos)
          setWaypoints(prevWaypoints => {
            // Se o primeiro waypoint for a "Sua Localização Atual", mantenha-o atualizado.
            // Isso permite o rastreamento em tempo real do ponto de partida.
            if (prevWaypoints.length > 0 && prevWaypoints[0].address === 'Sua Localização Atual') {
              const updated = [...prevWaypoints];
              updated[0] = { latitude, longitude, address: 'Sua Localização Atual' };
              return updated;
            }
            // Caso contrário, não atualize automaticamente se o usuário já definiu um ponto de partida manualmente.
            return prevWaypoints;
          });
        }
      );
    };

    startLocationTracking();

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, [hasLoadedInitialState]); // Dependência adicionada para garantir que o initializeState rode apenas uma vez

  useEffect(() => {
    // Salva o estado sempre que waypoints ou searchQuery mudam
    saveState();
    if (waypoints.length >= 2) {
      const handler = setTimeout(() => {
        fetchRoute();
      }, 500);
      return () => clearTimeout(handler);
    } else {
      setCoordinates([]);
    }
  }, [waypoints, searchQuery, fetchRoute]);

  return (
    <View style={styles.container}>
      <MapboxGL.MapView ref={mapRef} style={styles.map}>
        <MapboxGL.Camera
          ref={cameraRef}
          zoomLevel={cameraZoom}
          centerCoordinate={cameraCenter}
          followUserLocation={coordinates.length === 0}
          followZoomLevel={14}
          followUserMode="compass"
        />

        {currentLocation && (
          <MapboxGL.PointAnnotation id="userLocation" coordinate={[currentLocation.longitude, currentLocation.latitude]}>
            <View style={styles.userLocationDot} />
          </MapboxGL.PointAnnotation>
        )}

        {waypoints.map((point, index) => (
          <MapboxGL.PointAnnotation
            key={`waypoint-${index}`}
            id={`waypoint-${index}`}
            coordinate={[point.longitude, point.latitude]}
          >
            <View style={[styles.waypointDot, index === 0 && styles.originDot, index === waypoints.length - 1 && styles.destinationDot]} />
            <MapboxGL.Callout title={point.address || `Ponto ${index + 1}`} />
          </MapboxGL.PointAnnotation>
        ))}

        {coordinates.length > 0 && (
          <MapboxGL.ShapeSource
            id="routeSource"
            shape={{
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: coordinates,
              },
            }}
          >
            <MapboxGL.LineLayer
              id="routeLine"
              style={{ lineWidth: 4, lineColor: '#3b82f6', lineCap: 'round', lineJoin: 'round' }}
            />
          </MapboxGL.ShapeSource>
        )}
      </MapboxGL.MapView>

      <View style={[styles.controls, controlsMinimized && styles.controlsMinimized]}>
        <TouchableOpacity
          onPress={() => setControlsMinimized(!controlsMinimized)}
          style={styles.minimizeButton}
        >
          <MaterialIcons
            name={controlsMinimized ? "keyboard-arrow-up" : "keyboard-arrow-down"}
            size={24}
            color="black"
          />
        </TouchableOpacity>

        {!controlsMinimized && (
          <>
            <TextInput
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                fetchSuggestions(text);
              }}
              placeholder="Adicionar ponto (partida, parada, destino)..."
              style={styles.input}
            />
            {suggestions.length > 0 && (
              <FlatList
                data={suggestions}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => handleSuggestionSelect(item)}>
                    <Text style={styles.suggestion}>{item.address.freeformAddress}</Text>
                  </TouchableOpacity>
                )}
                style={styles.suggestionsList}
              />
            )}

            {waypoints.length > 0 && (
              <ScrollView style={styles.waypointsContainer}>
                <Text style={styles.waypointsTitle}>Pontos da Rota:</Text>
                {waypoints.map((point, index) => (
                  <View key={index} style={styles.waypointItem}>
                    <Text style={styles.waypointText}>
                      {index === 0 ? 'Partida: ' : index === waypoints.length - 1 ? 'Destino: ' : `Parada ${index}: `}
                      {point.address || `${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`}
                    </Text>
                    <TouchableOpacity onPress={() => removeWaypoint(index)} style={styles.removeWaypointButton}>
                      <Text style={styles.removeWaypointButtonText}>X</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={styles.buttonContainer}>
              <Button title="Gerar Rota" onPress={fetchRoute} disabled={waypoints.length < 2 || loading} />
              <Button title="Minha Posição" onPress={centerOnUser} />
            </View>
          </>
        )}
      </View>

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}
    </View>
  );
};

export default RotaMap;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  controls: {
    position: 'absolute',
    top: 40,
    left: 10,
    right: 10,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
    elevation: 5,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  controlsMinimized: {
    maxHeight: 50,
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  minimizeButton: {
    alignSelf: 'flex-end',
    marginBottom: 5,
  },
  input: {
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginBottom: 10,
  },
  suggestionsList: {
    maxHeight: 150,
    borderColor: '#eee',
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 10,
  },
  suggestion: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  waypointsContainer: {
    maxHeight: 150,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 4,
    padding: 5,
  },
  waypointsTitle: {
    fontWeight: 'bold',
    marginBottom: 5,
    fontSize: 16,
  },
  waypointItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  waypointText: {
    flex: 1,
    fontSize: 14,
  },
  removeWaypointButton: {
    backgroundColor: 'red',
    borderRadius: 15,
    width: 25,
    height: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  removeWaypointButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  loading: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -25 }, { translateY: -25 }],
    backgroundColor: 'rgba(255,255,255,0.7)',
    padding: 10,
    borderRadius: 10,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  userLocationDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'blue',
    borderWidth: 3,
    borderColor: 'white',
  },
  waypointDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    borderWidth: 2,
    borderColor: 'white',
  },
  originDot: {
    backgroundColor: 'green',
  },
  destinationDot: {
    backgroundColor: 'purple',
  },
});